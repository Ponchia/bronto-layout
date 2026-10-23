/** Owns an isolated Chrome profile, CDP connection, and reliable process cleanup. */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CDP } from './cdp-client.mjs';
import { findChromiumPageTarget } from './chromium-target.mjs';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry only Chromium processes that never publish a debugging endpoint.
 * The failed attempt must already have shut down its process and isolated
 * profile. Runtime, navigation, CDP and assertion errors are NOT retryable.
 * No unbounded retry loop: two total launches, at most.
 */
export async function retryChromiumPortStartup(launch, maxAttempts = 2) {
  if (typeof launch !== 'function' || !Number.isInteger(maxAttempts) ||
      maxAttempts < 1 || maxAttempts > 2) {
    throw new Error('Chromium port startup retry requires a launch function and 1..2 attempts');
  }
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await launch(attempt);
    } catch (error) {
      if (error?.code !== 'CHROME_DEBUG_PORT_TIMEOUT') throw error;
      if (attempt === maxAttempts) {
        if (attempt === 1) throw error;
        const last = error instanceof Error ? error.message : String(error);
        const failed = new Error('Chrome debugging endpoint did not start after ' +
          maxAttempts + ' isolated attempts; last failure: ' + last, { cause: error });
        failed.code = 'CHROME_DEBUG_PORT_TIMEOUT';
        throw failed;
      }
    }
  }
}

export async function startBrowser(chrome, timeout, noSandbox = false) {
  return retryChromiumPortStartup(() => startBrowserAttempt(chrome, timeout, noSandbox));
}

/** Chromium creates a Unix singleton socket below TMPDIR. Deep session scratch
 * paths can exceed the OS socket-path limit before CDP even starts. Keep the
 * browser's owned temporary directory short, without changing the caller's env.
 */
export function chromiumTempBase(directory = os.tmpdir(), platform = process.platform) {
  const socketPath = path.join(directory, 'bronto-layout-XXXXXX',
    'org.chromium.Chromium.XXXXXX', 'SingletonSocket');
  return platform !== 'win32' && Buffer.byteLength(socketPath) >= 100 ? '/tmp' : directory;
}

async function startBrowserAttempt(chrome, timeout, noSandbox = false) {
  const profile = await mkdtemp(path.join(chromiumTempBase(), 'bronto-layout-'));
  const child = spawn(chrome, [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking', '--disable-dev-shm-usage',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
    ...(noSandbox ? ['--no-sandbox'] : []),
  ], { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, TMPDIR: profile } });
  let startupDiagnostics = '';
  child.stderr?.on('data', data => { startupDiagnostics = (startupDiagnostics + data.toString()).slice(-8192); });
  let closed = false;
  let launchError;
  child.once('error', error => { launchError = error; });
  const stop = async () => {
    if (closed) return;
    closed = true;
    // Chrome may still be writing its profile when SIGTERM is delivered.
    // Wait for the process to exit before deleting it, or removal can race
    // with an active browser and fail with ENOTEMPTY.
    const hasExited = () => child.exitCode !== null || child.signalCode !== null;
    const waitForClose = async (timeout) => {
      if (hasExited()) return;
      await Promise.race([
        new Promise(resolve => child.once('close', resolve)),
        pause(timeout),
      ]);
    };
    if (!hasExited()) {
      child.kill('SIGTERM');
      await waitForClose(1500);
    }
    if (!hasExited()) {
      child.kill('SIGKILL');
      await waitForClose(1500);
    }
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
  };
  try {
    let port;
    // One hung Chrome startup must not consume the entire CLI timeout budget:
    // the retry gets a NEW process/profile. Explicit --timeout still extends
    // the per-attempt startup allowance when the user asks for it.
    const startupTimeout = Math.max(timeout, 15000);
    const deadline = Date.now() + startupTimeout;
    while (Date.now() < deadline) {
      if (launchError) throw new Error(`Chrome failed to launch: ${launchError.message}`);
      if (child.exitCode !== null || child.signalCode !== null) {
        const detail = startupDiagnostics.trim().slice(-1200);
        throw new Error(`Chrome exited before debugging started (${child.exitCode ?? child.signalCode})${detail ? `: ${detail}` : ''}`);
      }
      try {
        const data = await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8');
        port = Number(data.trim().split(/\r?\n/)[0]);
        if (port > 0) break;
      } catch { /* Chrome still starting. */ }
      await pause(50);
    }
    if (!port) {
      const detail = startupDiagnostics.trim().slice(-1200);
      const error = new Error('Chrome debugging endpoint did not start within ' + startupTimeout + 'ms' +
        (detail ? ': ' + detail : ''));
      error.code = 'CHROME_DEBUG_PORT_TIMEOUT';
      throw error;
    }
    // Independent page-target grace period: Chromium may publish its
    // debugging port before opening a usable tab on a heavily loaded runner.
    const pageDeadlineMs = Math.max(12000, Math.min(timeout, 30000));
    const { page } = await findChromiumPageTarget(port, {
      timeoutMs: pageDeadlineMs,
      isAlive: () => child.exitCode === null && child.signalCode === null
    });
    const cdp = new CDP(page.webSocketDebuggerUrl, timeout);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    return { cdp, async close() { cdp.close(); await stop(); } };
  } catch (error) { await stop(); throw error; }
}
