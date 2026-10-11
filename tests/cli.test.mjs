import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const cwd = path.resolve(import.meta.dirname, '..');
const cli = path.join(cwd, 'bin/bronto-layout.mjs');
const spec = path.join(cwd, 'examples/layout.json');
function run(extra = []) {
  return spawnSync(process.execPath, [cli, '--spec', spec, '--json', ...extra], {
    cwd, encoding: 'utf8', env: {...process.env, BRONTO_TEST_INLINE_FIXTURE: '1'}, timeout: 15000, maxBuffer: 1024 * 1024
  });
}
test('Chromium integration: well-formed layout passes across viewports', t => {
  const result = run();
  if (result.error?.code === 'ENOENT' || /Cannot find Chrome\/Chromium/.test(result.stderr || '')) { if (process.env.BRONTO_REQUIRE_CHROME === '1') throw new Error('Chromium is required for CI but was not found'); t.skip('Chrome unavailable'); return; }
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.reports.length, 4);
  assert.equal(report.summary.failed, 0);
  assert.equal(report.summary.passed, 18);
});
test('Chromium integration: broken layout produces actionable per-rule failures and failing exit', t => {
  const result = run(['--url', 'examples/broken.html']);
  if (result.error?.code === 'ENOENT' || /Cannot find Chrome\/Chromium/.test(result.stderr || '')) { if (process.env.BRONTO_REQUIRE_CHROME === '1') throw new Error('Chromium is required for CI but was not found'); t.skip('Chrome unavailable'); return; }
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.summary.failed, 12);
  const mobile = report.reports.find(r => r.viewport.width === 320);
  const gap = report.reports.find(r => r.viewport.width === 1280).findings.find(f => f.id === 'equal-card-gaps');
  assert.equal(mobile.findings.find(f => f.id === 'no-overflow').deviation, 39);
  assert.equal(gap.deviation, 12);
});
