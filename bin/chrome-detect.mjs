/** Optional local Chrome/Chromium discovery. Never downloads a browser. */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Prefer the installed stable Chrome channel over a potentially
 * development-only Chromium build when no explicit browser was selected.
 * This determines probe order only: it does not disable sandbox isolation,
 * download a browser or retry a failed launch with weaker security.
 */
export function linuxBrowserPriority() {
  return [
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/opt/google/chrome/chrome',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'
  ];
}

export function chromeExecutable(custom) {
  if (custom) {
    if (!existsSync(custom)) throw new Error(`Chrome executable does not exist: ${custom}`);
    return custom;
  }
  const candidates = [
    process.env.CHROME_PATH, process.env.CHROME_EXECUTABLE,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    ...linuxBrowserPriority(),
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
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome']) {
    const p = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8' });
    if (p.status === 0) return p.stdout.trim().split(/\r?\n/)[0];
  }
  throw new Error('Cannot find Chrome/Chromium. Install a browser locally or pass --chrome PATH. Existing Chromium browser caches are also supported.');
}
