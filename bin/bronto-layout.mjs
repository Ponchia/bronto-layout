#!/usr/bin/env node
/** Bronto Layout CLI: intentionally independent from Playwright, Puppeteer and UI frameworks. */
import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, existsSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs as parseNodeArgs } from 'node:util';
import { captureDOMGeometry } from '../dist/browser.js';
import { parseContract, validWidth } from '../dist/contract.js';
import { evaluateLayout } from '../dist/core.js';
import { compareReports } from '../dist/compare.js';
import { toSarif } from '../dist/sarif.js';
import { sweepLayout, widthRange } from '../dist/sweep.js';
import { mediaBreakpointSamples, combineCSSBreakpointSamples } from '../dist/breakpoints.js';
import { compactCheckReport, compactCompareReport } from '../dist/agent-report.js';
import { parseBatchManifest } from '../dist/batch.js';

const HELP = `Bronto Layout — browser-native spatial contracts

Usage:
  bronto-layout check --spec layout.json [--url URL] [--json|--sarif] [--report FILE]
  bronto-layout inspect --url URL [--selector name=CSS ...] [--width 375] [--json]
  bronto-layout init [--url URL] [--out bronto-layout.json]
  bronto-layout scan --spec layout.json --scan 320:1440:80 [--refine] [--json]
  bronto-layout compare --spec layout.json --baseline URL --url URL [--scan 320:1440:80] [--refine]
  bronto-layout validate --spec layout.json [--json]
  bronto-layout batch --manifest batch.json [--json --compact] [--dry-run]

Options:
  --spec FILE           Versioned layout contract (JSON)
  --manifest FILE       Batch jobs referencing individual layout contracts
  --dry-run             Validate and preview a batch without opening a browser
  --url URL|FILE        Target website, local HTML fixture, or development server
  --baseline URL|FILE   Original website or fixture for compare
  --widths CSV          Widths to check: 320,375,768,1280
  --width N             Single viewport width (for inspect or check)
  --height N            Viewport height (default: 900)
  --mobile              Emulate a touch/mobile browser viewport
  --locale TAG          Emulate locale and Accept-Language (e.g. ar, it-IT)
  --color-scheme MODE   Browser color preference: light or dark
  --reduced-motion     Emulate prefers-reduced-motion: reduce
  --scan MIN:MAX:STEP   Sample a responsive width range (maximum 200 coarse samples)
  --refine              Bisect observed state changes to one-pixel intervals
  --css-breakpoints     Add CSS media-query boundary widths to --scan
  --max-samples N       Maximum samples, including refinement (default: 200)
  --selector name=CSS   Named selector for inspect; can be repeated
  --ready-selector CSS  Wait for element to exist after page navigation
  --settle MS           Additional time for client-side rendering (default: 0)
  --timeout MS          Navigation and CDP operation timeout (default: 15000)
  --chrome PATH         Chrome/Chromium executable (autodetected otherwise)
  --no-sandbox          Explicitly disable Chromium sandbox (unsafe on untrusted URLs)
  --json                Machine-readable JSON to stdout
  --compact             With --json: actionable findings, sampled widths, and totals
  --sarif               SARIF 2.1.0 output (failures in check; regressions in compare)
  --report FILE         Write machine-readable JSON or SARIF report to disk
  --evidence-dir DIR    Annotated Chromium screenshots for failed widths (max 12)
  --fail-on-skip        Treat unmeasurable contract rules as failures in CI
  --out FILE            Output path for init (default: bronto-layout.json)
  --force               Overwrite an existing file with init
  --help                Show this help
  --version             Show current CLI version

Backward compatible: --spec file.json without a subcommand means check.
Exit codes: check 0 pass / 1 violation; compare 0 no regression / 1 regression; 2 input/runtime failure.
A compare result with previously failing rules is not a full clean bill of health.
No account, network service, hosted subscription, Playwright, or Puppeteer required.
`;

const OPTIONS = {
  spec: { type: 'string' }, manifest: { type: 'string' }, url: { type: 'string' }, baseline: { type: 'string' }, widths: { type: 'string' },
  width: { type: 'string' }, height: { type: 'string' }, mobile: { type: 'boolean' }, locale: { type: 'string' },
  'color-scheme': { type: 'string' }, 'reduced-motion': { type: 'boolean' }, scan: { type: 'string' },
  refine: { type: 'boolean' }, 'css-breakpoints': { type: 'boolean' }, 'max-samples': { type: 'string' },
  selector: { type: 'string', multiple: true },
  'ready-selector': { type: 'string' }, settle: { type: 'string' }, timeout: { type: 'string' },
  chrome: { type: 'string' }, 'no-sandbox': { type: 'boolean' }, json: { type: 'boolean' }, compact: { type: 'boolean' }, sarif: { type: 'boolean' }, report: { type: 'string' },
  'evidence-dir': { type: 'string' },
  out: { type: 'string' }, force: { type: 'boolean' }, 'fail-on-skip': { type: 'boolean' }, 'dry-run': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' }, version: { type: 'boolean' }
};
function argsFromCLI(args) {
  const parsed = parseNodeArgs({ args, options: OPTIONS, allowPositionals: true, strict: true });
  const positionals = parsed.positionals;
  const command = positionals[0] ?? 'check';
  if (!['check', 'scan', 'inspect', 'init', 'compare', 'validate', 'batch'].includes(command) || positionals.length > 1) {
    throw new Error(`Unknown command: ${positionals.join(' ')}. Run --help for available commands.`);
  }
  return { command, ...parsed.values };
}
function int(value, label, min, max) {
  const number = Number(value);
  if (!/^(0|[1-9]\d*)$/.test(String(value)) || !Number.isSafeInteger(number) || number < min || number > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}`);
  }
  return number;
}
function configFromArgs(a) {
  if (a.locale && !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/i.test(a.locale)) throw new Error('--locale must be a valid language tag');
  if (a['color-scheme'] && !['light', 'dark'].includes(a['color-scheme'])) throw new Error('--color-scheme must be light or dark');
  return {
    height: int(a.height ?? '900', '--height', 200, 10000),
    timeout: int(a.timeout ?? '15000', '--timeout', 100, 120000),
    settle: int(a.settle ?? '0', '--settle', 0, 30000),
    maxSamples: int(a['max-samples'] ?? '200', '--max-samples', 1, 2000),
    readySelector: a['ready-selector'] ?? undefined,
    mobile: Boolean(a.mobile),
    locale: a.locale ?? undefined,
    colorScheme: a['color-scheme'] ?? undefined,
    reducedMotion: Boolean(a['reduced-motion']),
  };
}
function getWidths(a, spec) {
  if (a.scan) {
    const parts = a.scan.split(':');
    if (parts.length !== 3) throw new Error('--scan requires MIN:MAX:STEP (for example 320:1440:80)');
    return widthRange(...parts.map(value => int(value, '--scan', 1, 10000)));
  }
  if (a.width !== undefined) return [int(a.width, '--width', 200, 10000)];
  if (a.widths !== undefined) {
    const widths = a.widths.split(',').map(value => int(value, '--widths', 200, 10000));
    if (!widths.length || new Set(widths).size !== widths.length) throw new Error('--widths must contain distinct widths');
    return widths;
  }
  return spec?.widths ?? [1280];
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function chromeExecutable(custom) {
  if (custom) {
    if (!existsSync(custom)) throw new Error(`Chrome executable does not exist: ${custom}`);
    return custom;
  }
  const candidates = [
    process.env.CHROME_PATH, process.env.CHROME_EXECUTABLE,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    '/opt/google/chrome/chrome', '/snap/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ...(process.platform === 'win32' ? [
      path.join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Google/Chrome/Application/chrome.exe'),
      path.join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe')
    ] : [])
  ];
  // Reuse *installed* browser binaries without requiring Playwright/Puppeteer as dependencies.
  // Cache probing is a convenience only: command-line --chrome always takes precedence.
  const architectureVariants = process.platform === 'linux'
    ? process.arch === 'arm64' ? ['chrome-linux-arm64/chrome'] : ['chrome-linux64/chrome', 'chrome-linux/chrome']
    : process.platform === 'darwin'
      ? process.arch === 'arm64' ? ['chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium']
        : ['chrome-mac/Chromium.app/Contents/MacOS/Chromium']
      : ['chrome-win64/chrome.exe'];
  const caches = [
    { root: path.join(os.homedir(), '.cache/ms-playwright'), pattern: /^chromium-\d+$/,
      variants: architectureVariants },
    { root: path.join(os.homedir(), '.cache/puppeteer/chrome'), pattern: /^(linux|mac|mac_arm|win64|win32)-/,
      variants: process.platform === 'linux' ? (process.arch === 'arm64' ? [] : ['chrome-linux64/chrome'])
        : process.platform === 'darwin' ? ['chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing']
        : ['chrome-win64/chrome.exe'] }
  ];
  for (const cache of caches) {
    let versions = [];
    try { versions = readdirSync(cache.root).filter(name => cache.pattern.test(name)).sort().reverse(); }
    catch { /* Optional cache not installed. */ }
    for (const version of versions) for (const variant of cache.variants) candidates.push(path.join(cache.root, version, variant));
  }
  for (const candidate of candidates) if (candidate && existsSync(candidate)) return candidate;
  for (const name of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'chrome']) {
    const p = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8' });
    if (p.status === 0) return p.stdout.trim().split(/\r?\n/)[0];
  }
  throw new Error('Cannot find Chrome/Chromium. Install a browser locally or pass --chrome PATH. Existing Chromium browser caches are also supported.');
}
class CDP {
  constructor(url, timeout) {
    this.seq = 0;
    this.timeout = timeout;
    this.pending = new Map();
    this.listeners = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.socket = new WebSocket(url);
      this.socket.onopen = resolve;
      this.socket.onerror = () => reject(new Error('CDP WebSocket connection failed'));
      this.socket.onmessage = event => {
        const data = JSON.parse(event.data);
        if (!data.id) {
          for (const listener of this.listeners.get(data.method) ?? []) listener(data.params ?? {});
          return;
        }
        const req = this.pending.get(data.id);
        if (!req) return;
        this.pending.delete(data.id);
        clearTimeout(req.timer);
        if (data.error) req.reject(new Error(`${req.method}: ${data.error.message}`));
        else req.resolve(data.result);
      };
      this.socket.onclose = () => {
        for (const req of this.pending.values()) { clearTimeout(req.timer); req.reject(new Error('CDP connection closed')); }
        this.pending.clear();
      };
    });
  }
  listen(method, callback) {
    const listeners = this.listeners.get(method) ?? new Set();
    listeners.add(callback); this.listeners.set(method, listeners);
    return () => { listeners.delete(callback); if (!listeners.size) this.listeners.delete(method); };
  }
  event(method, timeout = this.timeout) {
    let cancel;
    const promise = new Promise((resolve, reject) => {
      let unlisten;
      const timer = setTimeout(() => { unlisten?.(); reject(new Error(`Timed out waiting for ${method} after ${timeout}ms`)); }, timeout);
      unlisten = this.listen(method, payload => { clearTimeout(timer); unlisten(); resolve(payload); });
      cancel = () => { clearTimeout(timer); unlisten(); };
    });
    return { promise, cancel };
  }
  async send(method, params = {}) {
    await this.ready;
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Timed out running ${method} after ${this.timeout}ms`)); }, this.timeout);
      this.pending.set(id, { resolve, reject, method, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const value = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (value.exceptionDetails) {
      const details = value.exceptionDetails;
      throw new Error(details.exception?.description ?? details.text ?? 'Browser script failed');
    }
    return value.result?.value;
  }
  close() { this.socket.close(); }
}
async function startBrowser(chrome, timeout, noSandbox = false) {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'bronto-layout-'));
  const child = spawn(chrome, [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking', '--disable-dev-shm-usage',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
    ...(noSandbox ? ['--no-sandbox'] : []),
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
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
    // Browser launch can be slower than CDP operations under shared CI load.
    const startupTimeout = Math.max(timeout, 30000);
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
      throw new Error('Chrome debugging endpoint did not start within ' + startupTimeout + 'ms' +
        (detail ? ': ' + detail : ''));
    }
    let page;
    while (Date.now() < deadline) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) })).json();
        page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page) break;
      } catch { /* Server not listening yet. */ }
      await pause(50);
    }
    if (!page) throw new Error('Chrome launched but page target was not found');
    const cdp = new CDP(page.webSocketDebuggerUrl, timeout);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    return { cdp, async close() { cdp.close(); await stop(); } };
  } catch (error) { await stop(); throw error; }
}
async function serveTarget(raw) {
  if (/^https?:\/\//.test(raw)) return { url: raw, close() {} };
  const source = raw.startsWith('file://') ? fileURLToPath(raw) : path.resolve(raw);
  if (!existsSync(source)) throw new Error(`URL or file does not exist: ${raw}`);
  const root = path.dirname(source);
  const types = { '.html':'text/html', '.css':'text/css', '.js':'application/javascript', '.mjs':'application/javascript',
    '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
    '.webp':'image/webp', '.woff':'font/woff', '.woff2':'font/woff2' };
  const server = createServer((req, res) => {
    let file;
    try { file = path.resolve(root, decodeURIComponent((req.url || '').split('?')[0]).replace(/^\/+/, '')); }
    catch { res.writeHead(400).end(); return; }
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', types[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
    const stream = createReadStream(file);
    stream.on('error', () => { if (!res.headersSent) res.writeHead(404); res.end(); });
    stream.pipe(res);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  return { url: `http://127.0.0.1:${address.port}/${encodeURIComponent(path.basename(source))}`,
    sourcePath: source, close() { server.close(); } };
}
async function measure(cdp, url, width, selectors, config, fixtureHTML, actions = []) {
  // Respect CSS preference variants before navigating, so initial styles and
  // media-query evaluation use the requested environment throughout each sample.
  const features = [];
  if (config.colorScheme) features.push({ name: 'prefers-color-scheme', value: config.colorScheme });
  if (config.reducedMotion) features.push({ name: 'prefers-reduced-motion', value: 'reduce' });
  if (features.length) await cdp.send('Emulation.setEmulatedMedia', { features });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: config.height, deviceScaleFactor: config.mobile ? 2 : 1, mobile: config.mobile });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: config.mobile, maxTouchPoints: 5 });
  if (config.locale) {
    await cdp.send('Emulation.setLocaleOverride', { locale: config.locale });
    await cdp.send('Network.setExtraHTTPHeaders', { headers: { 'Accept-Language': config.locale } });
  }
  const loaded = cdp.event('Page.domContentEventFired', config.timeout);
  const responses = [];
  const unlisten = cdp.listen('Network.responseReceived', event => {
    if (event.type === 'Document') responses.push(event);
  });
  try {
    const navigated = await cdp.send('Page.navigate', { url });
    if (navigated.errorText) {
      if (navigated.errorText === 'net::ERR_BLOCKED_BY_ADMINISTRATOR' && process.env.BRONTO_TEST_INLINE_FIXTURE === '1' && fixtureHTML !== undefined) {
        // ONLY for intentionally self-contained test HTML in restricted CI sandboxes.
        // Production navigation must never silently fall back to incomplete DOM/styles.
        loaded.cancel(); loaded.promise.catch(() => {});
        await cdp.eval(`(() => { document.open(); document.write(${JSON.stringify(fixtureHTML)}); document.close(); return true; })()`);
      } else throw new Error(`Could not navigate: ${navigated.errorText}`);
    } else {
      await loaded.promise;
      // A 404 is a rendered DOM too; never allow a passing layout report against an error page.
      const mainResponse = responses.filter(event => event.frameId === navigated.frameId).at(-1);
      if (mainResponse?.response?.status >= 400) {
        throw new Error(`Navigation returned HTTP ${mainResponse.response.status} for ${mainResponse.response.url}`);
      }
    }
  } catch (error) {
    loaded.cancel(); loaded.promise.catch(() => {});
    throw error;
  } finally { unlisten(); }
  const readySelector = JSON.stringify(config.readySelector ?? '');
  await cdp.eval(`(async () => {
    const readySelector = ${readySelector};
    if (readySelector) {
      const deadline = performance.now() + ${config.timeout};
      while (!document.querySelector(readySelector)) {
        if (performance.now() >= deadline) throw new Error('Ready selector not found: ' + readySelector);
        await new Promise(r => setTimeout(r, 50));
      }
    }
    if (document.fonts) await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))]);
    if (${config.settle} > 0) await new Promise(r => setTimeout(r, ${config.settle}));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return true;
  })()`);
  for (const action of actions) await runAction(cdp, action, config.timeout);
  const snapshot = await cdp.eval(`(${captureDOMGeometry.toString()})(${JSON.stringify(selectors)})`);
  if (!snapshot?.viewport) throw new Error('Browser did not return a layout snapshot');
  return snapshot;
}
/** Execute only explicitly declared browser actions; no arbitrary JS from the contract. */
async function runAction(cdp, action, timeout) {
  const args = JSON.stringify(action);
  await cdp.eval(`(async () => {
    const action = ${args};
    if (action.type === 'pause') { await new Promise(r => setTimeout(r, action.milliseconds)); return; }
    const deadline = performance.now() + ${timeout};
    let element;
    while (!(element = document.querySelector(action.selector))) {
      if (performance.now() >= deadline) throw new Error('Action element not found: ' + action.selector);
      await new Promise(r => setTimeout(r, 50));
    }
    if (action.type === 'click') element.click();
    else if (action.type === 'fill') {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement))
        throw new Error('Fill requires input or textarea: ' + action.selector);
      const proto = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, action.value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (action.type === 'scroll-into-view') element.scrollIntoView({ block: 'center' });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  })()`);
}
function resolveURL(a, spec) {
  const raw = a.url ?? spec?.url;
  if (!raw) throw new Error('Provide --url URL (or a URL in --spec)');
  if (/^https?:\/\//.test(raw) || /^file:\/\//.test(raw)) return raw;
  return path.resolve(a.url ? process.cwd() : path.dirname(path.resolve(a.spec)), raw);
}
async function withBrowser(url, a, execute) {
  const config = configFromArgs(a);
  const target = await serveTarget(url);
  let browser;
  try {
    browser = await startBrowser(chromeExecutable(a.chrome), config.timeout, Boolean(a['no-sandbox'] || process.env.BRONTO_CHROME_NO_SANDBOX === '1'));
    const fixture = process.env.BRONTO_TEST_INLINE_FIXTURE === '1' && target.sourcePath ? await readFile(target.sourcePath, 'utf8') : undefined;
    return await execute(browser.cdp, target.url, config, fixture, target.sourcePath ? pathToFileURL(target.sourcePath).href : target.url);
  } finally { await browser?.close(); target.close(); }
}
function hasUnmeasuredRules(reports) {
  return reports.some(report => report.findings.some(f => f.status === 'skip' && f.code === 'measurement-unavailable'));
}

/** Discover media-query thresholds in the same CDP session used for measuring.
 * Inspect both ends of the scan: apps may load different stylesheets by width.
 * Dynamic JS- or container-query breakpoints are outside this CSS-only feature.
 */
async function discoverCSSBreakpointWidths(cdp, url, coarseWidths, config, fixture, actions = []) {
  const range = [...coarseWidths].sort((a, b) => a - b);
  const min = range[0], max = range.at(-1);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const sources = [];
  for (const width of new Set([min, max])) {
    await measure(cdp, url, width, {}, config, fixture, actions);
    let data;
    try { data = await cdp.send('CSS.getMediaQueries'); }
    catch (error) { throw new Error('--css-breakpoints requires CSS.getMediaQueries: ' + error.message); }
    sources.push(mediaBreakpointSamples(data.medias ?? [], min, max));
  }
  const discovered = combineCSSBreakpointSamples(coarseWidths, ...sources);
  if (discovered.widths.length > config.maxSamples) {
    throw new Error(`CSS breakpoint sweep has ${discovered.widths.length} widths, exceeding --max-samples ${config.maxSamples}; shorten --scan range`);
  }
  return discovered;
}
function summary(reports) {
  return reports.reduce((total, report) => ({
    passed: total.passed + report.summary.passed, failed: total.failed + report.summary.failed,
    skipped: total.skipped + report.summary.skipped
  }), { passed: 0, failed: 0, skipped: 0 });
}
async function output(a, data, printable, sarif) {
  const payload = a.sarif ? sarif : data;
  if (a.sarif && !sarif) throw new Error('SARIF is supported for check and compare, not this command');
  if (a.report) await writeFile(a.report, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  if (a.json || a.sarif) console.log(JSON.stringify(payload, null, 2));
  else console.log(printable);
}
/** Evidence is opt-in, screenshot-bound, and capped; it is not a broad screenshot-testing framework.
 *  Drawing happens in a temporary DOM overlay after measurement, and is always removed.
 */
async function saveEvidence(cdp, snapshot, failures, width, a, label) {
  if (!a['evidence-dir']) return undefined;
  const elementsByPath = new Map(Object.values(snapshot.selectors).flat().map(element => [element.path, element]));
  const marks = new Map();
  for (const finding of failures) {
    for (const elementPath of finding.paths ?? []) {
      const geometry = elementsByPath.get(elementPath);
      if (!geometry) continue;
      const existing = marks.get(elementPath) ?? { ...geometry.rect, paths: [elementPath], ruleIds: [] };
      existing.ruleIds.push(finding.id);
      marks.set(elementPath, existing);
    }
  }
  // A document-overflow rule may have no named element; the screenshot still provides visual context.
  const highlighted = [...marks.values()].map(item => ({ x: item.x, y: item.y, width: item.width, height: item.height,
    label: [...new Set(item.ruleIds)].slice(0, 3).join(', ') })).slice(0, 24);
  await cdp.eval(`(() => {
    document.getElementById('__bronto_layout_evidence')?.remove();
    const markups = ${JSON.stringify(highlighted)};
    const root = document.createElement('div'); root.id = '__bronto_layout_evidence';
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;isolation:isolate;font:12px system-ui';
    const banner = document.createElement('div'); banner.textContent = 'BRONTO LAYOUT · ${label} · ${width}px';
    banner.style.cssText = 'position:absolute;left:8px;top:8px;background:#7f1d1d;color:white;padding:6px 9px;border-radius:3px;font-weight:700;z-index:2';
    root.append(banner);
    for (const m of markups) {
      const box = document.createElement('div');
      box.style.cssText = 'position:absolute;box-sizing:border-box;border:2px solid #e11d48;background:rgba(225,29,72,.08);' +
        'left:' + m.x + 'px;top:' + m.y + 'px;width:' + m.width + 'px;height:' + m.height + 'px';
      const title = document.createElement('div'); title.textContent = m.label;
      title.style.cssText = 'position:absolute;left:0;bottom:100%;background:#e11d48;color:white;white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis;padding:2px 4px';
      box.append(title); root.append(box);
    }
    document.documentElement.append(root);
    return true;
  })()`);
  try {
    const image = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
    if (!image?.data) throw new Error('Browser did not return screenshot bytes');
    const directory = path.resolve(a['evidence-dir']);
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, `${label}-${width}px.png`);
    await writeFile(file, Buffer.from(image.data, 'base64'));
    return file;
  } finally {
    await cdp.eval("(() => { document.getElementById('__bronto_layout_evidence')?.remove(); return true; })()");
  }
}
function selectorsForInspect(flags) {
  const values = flags.selector ?? [];
  if (!values.length) return { root: 'body', header: 'header', main: 'main', footer: 'footer' };
  const selectors = {};
  for (const item of values) {
    const equals = item.indexOf('=');
    if (equals <= 0 || !item.slice(equals + 1).trim()) throw new Error(`Invalid --selector ${item}; expected name=CSS`);
    const alias = item.slice(0, equals);
    if (alias === 'viewport' || Object.hasOwn(selectors, alias)) throw new Error(`Invalid or repeated selector alias: ${alias}`);
    selectors[alias] = item.slice(equals + 1);
  }
  return selectors;
}
async function check(a) {
  if (!a.spec) throw new Error('check requires --spec FILE');
  const spec = parseContract(JSON.parse(await readFile(a.spec, 'utf8')));
  const widths = getWidths(a, spec);
  if (!widths.every(validWidth)) throw new Error('Invalid viewport widths');
  const result = await withBrowser(resolveURL(a, spec), a, async (cdp, url, config, fixture, publicURL) => {
    const cssBreakpoints = a['css-breakpoints']
      ? await discoverCSSBreakpointWidths(cdp, url, widths, config, fixture, spec.actions)
      : undefined;
    const sampledWidths = cssBreakpoints?.widths ?? widths;
    const evidence = [];
    const checked = await sweepLayout(sampledWidths, async width => {
      const snapshot = await measure(cdp, url, width, spec.selectors, config, fixture, spec.actions);
      const report = evaluateLayout(snapshot, spec.rules);
      if (report.summary.failed && evidence.length < 12 && a['evidence-dir']) {
        const screenshot = await saveEvidence(cdp, snapshot, report.findings.filter(f => f.status === 'fail'), width, a, 'check');
        if (screenshot) evidence.push({ width, screenshot });
      }
      return report;
    }, Boolean(a.refine), config.maxSamples);
    const total = summary(checked.reports);
    return { schemaVersion: 1, mode: 'check', url: publicURL, summary: total, reports: checked.reports, transitions: checked.transitions,
      ...(cssBreakpoints ? { cssBreakpointScan: cssBreakpoints } : {}), ...(a['evidence-dir'] ? { evidence } : {}) };
  });
  const printable = [
    `Bronto Layout — ${result.url}`,
    ...(result.cssBreakpointScan ? [`CSS thresholds: ${result.cssBreakpointScan.thresholds.join(', ') || 'none'}; additional widths: ${result.cssBreakpointScan.addedWidths.join(', ') || 'none'}`] : []),
    ...result.reports.map(r => `${r.viewport.width}px (${r.viewport.direction}): ${r.summary.passed} passed, ${r.summary.failed} failed, ${r.summary.skipped} skipped`),
    ...result.reports.flatMap(r => r.findings.filter(f => f.status === 'fail' || (a['fail-on-skip'] && f.code === 'measurement-unavailable')).map(f => `  ${r.viewport.width}px ${f.status.toUpperCase()} ${f.id}: ${f.message}`)),
    ...(result.transitions.length ? ['Observed transitions:', ...result.transitions.map(t => `  ${t.ruleId}: ${t.from} → ${t.to}, ${t.previousWidth}–${t.width}px (${t.precision})`)] : []),
    `Total: ${result.summary.failed} failed, ${result.summary.passed} passed, ${result.summary.skipped} skipped`
  ].join('\n');
  await output(a, a.compact ? compactCheckReport(result) : result, printable, toSarif(result.url, result.reports));
  if (result.summary.failed || (a['fail-on-skip'] && hasUnmeasuredRules(result.reports))) process.exitCode = 1;
}
async function inspect(a) {
  const selectors = selectorsForInspect(a);
  const widths = getWidths(a);
  if (a.refine) throw new Error('--refine applies only to check or scan with a contract');
  const result = await withBrowser(resolveURL(a), a, async (cdp, url, config, fixture, publicURL) => {
    const snapshots = [];
    const evidence = [];
    for (const width of widths) {
      const snapshot = await measure(cdp, url, width, selectors, config, fixture);
      snapshots.push(snapshot);
      if (evidence.length < 12 && a['evidence-dir']) {
        const paths = Object.values(snapshot.selectors).flat().slice(0, 24).map(el => el.path);
        const screenshot = await saveEvidence(cdp, snapshot, [{ id: 'selected elements', paths }], width, a, 'inspect');
        if (screenshot) evidence.push({ width, screenshot });
      }
    }
    return { schemaVersion: 1, mode: 'inspect', url: publicURL, snapshots, ...(a['evidence-dir'] ? { evidence } : {}) };
  });
  const text = [
    `Bronto Layout inspection — ${result.url}`,
    ...result.snapshots.flatMap(s => [
      `${s.viewport.width}px · ${s.viewport.direction} · document ${s.document.width}×${s.document.height} · overflow ${Math.max(0, s.document.width - (s.viewport.contentWidth ?? s.viewport.width))}px`,
      ...Object.entries(s.selectors).flatMap(([alias, elements]) => [
        `  ${alias} — ${s.selectorCounts?.[alias] ?? elements.length} visible match(es)${(s.selectorCounts?.[alias] ?? elements.length) > elements.length ? ', ' + elements.length + ' measured' : ''}`,
        ...elements.slice(0, 20).map(el => `    ${el.path} [${[el.rect.x, el.rect.y, el.rect.width, el.rect.height].map(n => Number(n.toFixed(2))).join(', ')}]`),
        ...(elements.length > 20 ? [`    ... ${elements.length - 20} more (see JSON output)`] : [])
      ])
    ])
  ].join('\n');
  await output(a, result, text);
}
async function init(a) {
  const file = path.resolve(a.out ?? 'bronto-layout.json');
  if (!a.force && existsSync(file)) throw new Error(`${file} exists; use --force to overwrite`);
  const data = {
    schemaVersion: 1,
    url: a.url ?? 'http://127.0.0.1:5173/',
    widths: [320, 375, 768, 1280],
    selectors: { page: 'body', main: 'main' },
    rules: [
      { id: 'horizontal-overflow', type: 'document-overflow', tolerance: 1 },
      { id: 'main-exists', type: 'selector-count', element: 'main', min: 1 }
    ]
  };
  // The starter contract is only a template; the user should revise rules to match their site's intent.
  await writeFile(file, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf8', flag: a.force ? 'w' : 'wx' });
  await output(a, { schemaVersion: 1, mode: 'init', file }, `Created ${file}. Adjust selectors and layout intent before use.`);
}
async function compare(a) {
  if (!a.spec) throw new Error('compare requires --spec FILE');
  if (!a.baseline || !a.url) throw new Error('compare requires --baseline URL and --url URL');
  const spec = parseContract(JSON.parse(await readFile(a.spec, 'utf8')));
  const widths = getWidths(a, spec);
  if (!widths.every(validWidth)) throw new Error('Invalid viewport widths');
  const candidatePath = resolveURL(a, spec);
  const baselinePath = /^https?:\/\//.test(a.baseline) || /^file:\/\//.test(a.baseline) ? a.baseline : path.resolve(a.baseline);
  const result = await withBrowser(candidatePath, a, async (cdp, candidateUrl, config, fixture, publicURL) => {
    const baselineTarget = await serveTarget(baselinePath);
    const baselineFixture = process.env.BRONTO_TEST_INLINE_FIXTURE === '1' && baselineTarget.sourcePath ? await readFile(baselineTarget.sourcePath, 'utf8') : undefined;
    try {
      // Compare CSS breakpoints from BOTH revisions: a newly introduced
      // breakpoint may be the source of a regression.
      const cssBreakpoints = a['css-breakpoints']
        ? combineCSSBreakpointSamples(widths,
          await discoverCSSBreakpointWidths(cdp, baselineTarget.url, widths, config, baselineFixture, spec.actions),
          await discoverCSSBreakpointWidths(cdp, candidateUrl, widths, config, fixture, spec.actions))
        : undefined;
      if (cssBreakpoints && cssBreakpoints.widths.length > config.maxSamples) {
        throw new Error(`CSS breakpoint comparison has ${cssBreakpoints.widths.length} widths, exceeding --max-samples ${config.maxSamples}`);
      }
      const sampledWidths = cssBreakpoints?.widths ?? widths;
      // A shared browser measures both revisions with exactly the same viewport and browser engine.
      // Each sample fully navigates again to avoid stale page geometry between revisions.
      const baseSnapshots = new Map();
      const candidateSnapshots = new Map();
      const evidence = [];
      const sweep = await sweepLayout(sampledWidths, async width => {
        const baseline = evaluateLayout(await measure(cdp, baselineTarget.url, width, spec.selectors, config, baselineFixture, spec.actions), spec.rules);
        const candidateGeometry = await measure(cdp, candidateUrl, width, spec.selectors, config, fixture, spec.actions);
        const candidate = evaluateLayout(candidateGeometry, spec.rules);
        if (a['evidence-dir'] && evidence.length < 12) {
          const singleWidth = compareReports(baselineTarget.url, candidateUrl, [baseline], [candidate]);
          const failures = candidate.findings.filter(f => singleWidth.changes.some(c => c.ruleId === f.id && c.kind === 'regression'));
          if (failures.length) {
            const screenshot = await saveEvidence(cdp, candidateGeometry, failures, width, a, 'compare');
            if (screenshot) evidence.push({ width, screenshot });
          }
        }
        baseSnapshots.set(width, baseline);
        candidateSnapshots.set(width, candidate);
        // A combined signature refines transitions in *either* revision, not only the candidate.
        return {
          viewport: candidate.viewport,
          summary: candidate.summary,
          findings: [
            ...baseline.findings.map(f => ({ ...f, id: `baseline:${f.id}` })),
            ...candidate.findings.map(f => ({ ...f, id: `candidate:${f.id}` }))
          ]
        };
      }, Boolean(a.refine), config.maxSamples);
      const selectedWidths = sweep.reports.map(r => r.viewport.width);
      const comparison = compareReports(baselineTarget.sourcePath ? pathToFileURL(baselineTarget.sourcePath).href : baselineTarget.url, publicURL,
        selectedWidths.map(width => baseSnapshots.get(width)), selectedWidths.map(width => candidateSnapshots.get(width)));
      return { ...comparison, ...(cssBreakpoints ? { cssBreakpointScan: cssBreakpoints } : {}),
        ...(a['evidence-dir'] ? { evidence } : {}) };
    } finally { baselineTarget.close(); }
  });
  const important = result.changes.filter(c => c.kind !== 'unchanged');
  const printable = [
    `Bronto Layout comparison — ${result.baselineUrl} → ${result.candidateUrl}`,
    ...(result.cssBreakpointScan ? [`CSS thresholds: ${result.cssBreakpointScan.thresholds.join(', ') || 'none'}; additional widths: ${result.cssBreakpointScan.addedWidths.join(', ') || 'none'}`] : []),
    ...important.map(c => `  ${c.width}px ${c.kind.toUpperCase()} ${c.ruleId}: ${c.baselineStatus} → ${c.candidateStatus}${c.errorDelta === undefined ? '' : `, error Δ ${c.errorDelta.toFixed(2)}${c.errorUnit}`}`),
    `Total: ${result.summary.regressions} regressions, ${result.summary.improvements} improvements, ${result.summary.unverified} unverified, ${result.summary.candidateFailures} candidate violations remaining`
  ].join('\n');
  await output(a, a.compact ? compactCompareReport(result) : result, printable, toSarif(result.candidateUrl, result.candidate, result));
  if (result.summary.regressions || (a['fail-on-skip'] && (result.summary.unverified || hasUnmeasuredRules(result.candidate)))) process.exitCode = 1;
}
async function batch(a) {
  const manifestFile = path.resolve(a.manifest);
  const manifest = parseBatchManifest(JSON.parse(await readFile(manifestFile, 'utf8')));
  // Validate every referenced contract before launching any browser.
  const baseDirectory = path.dirname(manifestFile);
  const jobs = await Promise.all(manifest.jobs.map(async job => {
    const spec = path.resolve(baseDirectory, job.spec);
    const contract = parseContract(JSON.parse(await readFile(spec, 'utf8')));
    return { ...job, absoluteSpec: spec, contractURL: contract.url };
  }));
  if (a['dry-run']) {
    const data = {
      schemaVersion: 1, mode: 'batch-plan', manifest: manifestFile,
      total: jobs.length,
      jobs: jobs.map(job => ({ id: job.id, spec: job.absoluteSpec,
        target: job.url ?? job.contractURL ?? null,
        widths: job.widths ?? null, scan: job.scan ?? null,
        cssBreakpoints: Boolean(job.cssBreakpoints),
        locale: job.locale ?? a.locale ?? null,
        colorScheme: job.colorScheme ?? a['color-scheme'] ?? null,
        reducedMotion: Boolean(job.reducedMotion ?? a['reduced-motion']),
        mobile: Boolean(job.mobile ?? a.mobile) }))
    };
    await output(a, data, 'Validated ' + jobs.length + ' batch jobs without opening Chromium');
    return;
  }
  const outcomes = [];
  for (const job of jobs) {
    const argv = [fileURLToPath(import.meta.url), 'check', '--spec', job.absoluteSpec, '--json'];
    if (a.compact) argv.push('--compact');
    if (job.url) argv.push('--url', /^https?:\/\//.test(job.url) || /^file:\/\//.test(job.url)
      ? job.url : path.resolve(baseDirectory, job.url));
    if (job.widths) argv.push('--widths', job.widths.join(','));
    if (job.scan) argv.push('--scan', job.scan);
    if (job.cssBreakpoints) argv.push('--css-breakpoints');
    const locale = job.locale ?? a.locale;
    if (locale) argv.push('--locale', locale);
    const scheme = job.colorScheme ?? a['color-scheme'];
    if (scheme) argv.push('--color-scheme', scheme);
    if (job.reducedMotion ?? a['reduced-motion']) argv.push('--reduced-motion');
    if (job.mobile ?? a.mobile) argv.push('--mobile');
    for (const [option, value] of [['height', a.height], ['timeout', a.timeout],
      ['settle', a.settle], ['chrome', a.chrome]]) {
      if (value !== undefined) argv.push('--' + option, value);
    }
    if (a['no-sandbox']) argv.push('--no-sandbox');
    if (a['fail-on-skip']) argv.push('--fail-on-skip');
    if (a['evidence-dir']) argv.push('--evidence-dir', path.join(a['evidence-dir'], job.id));
    // Run each check with Node argv, never a shell or a manifest-provided command.
    const runtime = configFromArgs(a);
    const sampleCount = job.scan ? getWidths({ scan: job.scan }).length + 24 : (job.widths?.length ?? 4);
    const timeout = Math.min(600000, Math.max(90000, runtime.timeout * (sampleCount + 3)));
    const child = spawnSync(process.execPath, argv, {
      cwd: process.cwd(), encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024, env: process.env
    });
    let report;
    try { report = JSON.parse(child.stdout); } catch { report = null; }
    const exitCode = (child.status === 0 || child.status === 1) && report?.mode === 'check'
      ? child.status : 2;
    const status = exitCode === 2 ? 'error' : exitCode === 1 ? 'violations' : 'pass';
    outcomes.push({
      id: job.id, status, exitCode,
      ...(report ? { result: report } : {
        result: { schemaVersion: 1, mode: 'error', status: 'error', exitCode: 2,
          error: { code: 'BATCH_JOB_ERROR', message: child.error?.message || child.stderr?.trim() ||
            'Job exited without a readable JSON report' } }
      })
    });
  }
  const summaryData = {
    total: outcomes.length,
    passed: outcomes.filter(j => j.status === 'pass').length,
    violations: outcomes.filter(j => j.status === 'violations').length,
    errors: outcomes.filter(j => j.status === 'error').length,
    checksPassed: outcomes.reduce((n, j) => n + (j.result?.summary?.passed ?? 0), 0),
    checksFailed: outcomes.reduce((n, j) => n + (j.result?.summary?.failed ?? 0), 0)
  };
  const result = { schemaVersion: 1, mode: 'batch', manifest: manifestFile,
    ...(a.compact ? { format: 'compact' } : {}), summary: summaryData, jobs: outcomes };
  const printable = [
    'Bronto Layout batch — ' + manifestFile,
    ...outcomes.map(j => '  ' + j.id + ': ' + j.status.toUpperCase() +
      ' (exit ' + j.exitCode + ', ' + (j.result?.summary?.failed ?? 0) + ' failed checks)'),
    'Total: ' + summaryData.passed + ' passed, ' + summaryData.violations +
      ' with violations, ' + summaryData.errors + ' errors'
  ].join('\n');
  await output(a, result, printable);
  if (summaryData.errors) process.exitCode = 2;
  else if (summaryData.violations) process.exitCode = 1;
}

async function validate(a) {
  if (!a.spec) throw new Error('validate requires --spec FILE');
  const spec = parseContract(JSON.parse(await readFile(a.spec, 'utf8')));
  const data = { schemaVersion: 1, mode: 'validate', file: path.resolve(a.spec),
    valid: true, widths: spec.widths ?? [], selectors: Object.keys(spec.selectors),
    rules: spec.rules.map(({ id, type }) => ({ id, type })) };
  await output(a, data, `Valid layout contract: ${data.selectors.length} selectors, ${data.rules.length} rules${data.widths.length ? `, ${data.widths.length} widths` : ''}`);
}
async function main() {
  const a = argsFromCLI(process.argv.slice(2));
  if (a.help) { console.log(HELP); return; }
  if (a.version) { console.log('Bronto Layout 0.3.0'); return; }
  if (a.json && a.sarif) throw new Error('Choose --json or --sarif, not both');
  if (a.compact && (!a.json || !['check', 'scan', 'compare', 'batch'].includes(a.command))) {
    throw new Error('--compact requires --json with check, scan, or compare');
  }
  if (a['css-breakpoints'] && !a.scan) throw new Error('--css-breakpoints requires --scan MIN:MAX:STEP');
  if (a['css-breakpoints'] && !['check', 'scan', 'compare'].includes(a.command)) throw new Error('--css-breakpoints applies only to check, scan and compare');
  if (a.command === 'batch' && !a.manifest) throw new Error('batch requires --manifest FILE');
  if (a['dry-run'] && a.command !== 'batch') throw new Error('--dry-run applies only to batch');
  if (a.command !== 'batch' && a.manifest) throw new Error('--manifest applies only to batch');
  if (a.command === 'batch' && a.spec) throw new Error('batch reads contracts from its manifest; omit --spec');
  if (a.command === 'batch' && a.sarif) throw new Error('batch supports JSON reports, not SARIF');
  configFromArgs(a);
  if (a.command === 'batch') await batch(a);
  else if (a.command === 'init') await init(a);
  else if (a.command === 'validate') await validate(a);
  else if (a.command === 'compare') await compare(a);
  else if (a.command === 'inspect') await inspect(a);
  else if (a.command === 'scan') {
    if (!a.scan) throw new Error('scan requires --scan MIN:MAX:STEP');
    await check(a);
  } else await check(a);
}
main().catch(async error => {
  process.exitCode = 2;
  const message = error instanceof Error ? error.message : String(error);
  const args = process.argv.slice(2);
  const report = {
    schemaVersion: 1, mode: 'error', status: 'error', exitCode: 2,
    error: { code: 'CLI_ERROR', message }
  };
  if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else console.error('Bronto Layout: ' + message);
  const index = args.lastIndexOf('--report');
  const pathValue = index >= 0 ? args[index + 1] : args.find(arg => arg.startsWith('--report='))?.slice(9);
  if (pathValue && !pathValue.startsWith('--')) {
    try {
      await mkdir(path.dirname(path.resolve(pathValue)), { recursive: true });
      await writeFile(pathValue, JSON.stringify(report, null, 2) + '\n', 'utf8');
    } catch (failure) {
      console.error('Bronto Layout: Could not write failure report: ' + failure.message);
    }
  }
});
