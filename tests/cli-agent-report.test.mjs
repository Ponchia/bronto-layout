import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const cwd = path.resolve(import.meta.dirname, '..');
const cli = path.join(cwd, 'bin/bronto-layout.mjs');
const run = args => spawnSync(process.execPath, [cli, ...args], {
  cwd, encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024,
  env: { ...process.env, BRONTO_TEST_INLINE_FIXTURE: '1', BRONTO_CHROME_NO_SANDBOX: '1' }
});
function unavailable(result, t) {
  if (result.error?.code === 'ENOENT' || /Cannot find Chrome\/Chromium/.test(result.stderr || '')) {
    if (process.env.BRONTO_REQUIRE_CHROME === '1') throw new Error('Chromium required on CI');
    t.skip('Chromium not available'); return true;
  }
  return false;
}
test('fatal input errors produce JSON and a failure report, not unparseable stderr', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bronto-cli-agent-error-'));
  try {
    const file = path.join(dir, 'missing', 'error.json');
    const result = run(['check', '--spec', 'not-found.json', '--json', '--report', file]);
    assert.equal(result.status, 2);
    const data = JSON.parse(result.stdout);
    assert.equal(data.mode, 'error');
    assert.equal(data.status, 'error');
    assert.equal(data.exitCode, 2);
    assert.match(data.error.message, /ENOENT/);
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), data);
  } finally { rmSync(dir, { force: true, recursive: true }); }
});
test('compact flag is opt-in and restricted to JSON layout checks', () => {
  const r = run(['validate', '--spec', 'examples/layout.json', '--json', '--compact']);
  assert.equal(r.status, 2);
  assert.equal(JSON.parse(r.stdout).mode, 'error');
  assert.match(JSON.parse(r.stdout).error.message, /requires --json/);
});
test('CLI emits compact failing widths with real Chromium measurements', t => {
  const result = run(['check', '--spec', 'examples/layout.json', '--url', 'examples/broken.html', '--json', '--compact']);
  if (unavailable(result, t)) return;
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const data = JSON.parse(result.stdout);
  assert.equal(data.format, 'compact');
  assert.deepEqual(data.sampledWidths, [320, 375, 768, 1280]);
  assert.equal(data.summary.failed, 12);
  assert.equal(data.failures.length, 12);
  assert.equal(data.omittedFailures, 0);
  assert.equal('reports' in data, false);
  assert.ok(data.failures.every(item => Number.isFinite(item.deviation)));
});
test('CLI compare retains existing candidate failures and highlights new regressions', t => {
  const result = run(['compare', '--spec', 'examples/layout.json', '--baseline', 'examples/healthy.html',
    '--url', 'examples/broken.html', '--json', '--compact']);
  if (unavailable(result, t)) return;
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const data = JSON.parse(result.stdout);
  assert.equal(data.mode, 'compare');
  assert.equal(data.format, 'compact');
  assert.ok(data.summary.regressions > 0);
  assert.ok(data.changes.some(item => item.kind === 'regression'));
  assert.equal(data.remainingFailures.length, data.summary.candidateFailures);
  assert.equal('candidate' in data, false);
});
