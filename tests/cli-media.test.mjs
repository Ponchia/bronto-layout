import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const cwd = path.resolve(import.meta.dirname, '..');
const cli = path.join(cwd, 'bin/bronto-layout.mjs');
const run = args => spawnSync(process.execPath, [cli, ...args], {
  cwd, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024,
  env: { ...process.env, BRONTO_TEST_INLINE_FIXTURE: '1', BRONTO_CHROME_NO_SANDBOX: '1' }
});
function chromiumUnavailable(t, result) {
  if (result.error?.code === 'ENOENT' || /Cannot find Chrome\/Chromium/.test(result.stderr || '')) {
    if (process.env.BRONTO_REQUIRE_CHROME === '1') throw new Error('Chromium required for CI');
    t.skip('Chromium unavailable');
    return true;
  }
  return false;
}
test('inspect defaults reflect actual browser preference state', t => {
  const r = run(['inspect', '--url', 'examples/media-preferences.html',
    '--selector', 'card=#card', '--width', '375', '--json']);
  if (chromiumUnavailable(t, r)) return;
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const snapshot = JSON.parse(r.stdout).snapshots[0];
  // Without explicit emulation, this should reflect whichever settings the
  // launching environment gives Chromium, not assume a light-mode OS.
  assert.ok(['light', 'dark'].includes(snapshot.viewport.colorScheme));
  assert.equal(typeof snapshot.viewport.reducedMotion, 'boolean');
  assert.equal(snapshot.selectors.card[0].rect.width, snapshot.viewport.colorScheme === 'dark' ? 160 : 100);
  assert.equal(snapshot.selectors.card[0].rect.x, snapshot.viewport.reducedMotion ? 40 : 20);
});
test('CSS dark and reduced-motion media variants are measured as actual geometry', t => {
  const r = run(['inspect', '--url', 'examples/media-preferences.html',
    '--selector', 'card=#card', '--width', '375', '--color-scheme', 'dark', '--reduced-motion', '--json']);
  if (chromiumUnavailable(t, r)) return;
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const snapshot = JSON.parse(r.stdout).snapshots[0];
  assert.equal(snapshot.viewport.colorScheme, 'dark');
  assert.equal(snapshot.viewport.reducedMotion, true);
  assert.equal(snapshot.selectors.card[0].rect.width, 160);
  assert.equal(snapshot.selectors.card[0].rect.x, 40);
});
test('a contract can explicitly verify the intended dark/reduced state', t => {
  const r = run(['check', '--spec', 'examples/media-preferences.json',
    '--color-scheme', 'dark', '--reduced-motion', '--json']);
  if (chromiumUnavailable(t, r)) return;
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const report = JSON.parse(r.stdout);
  assert.equal(report.summary.failed, 0);
  assert.equal(report.summary.passed, 2);
});
test('invalid CSS preference values are rejected before browser startup', () => {
  const r = run(['check', '--spec', 'examples/media-preferences.json',
    '--color-scheme', 'sepia']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /color-scheme must be light or dark/);
});
