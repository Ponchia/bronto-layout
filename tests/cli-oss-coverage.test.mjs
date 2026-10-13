import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const cwd = path.resolve(import.meta.dirname, '..');
const cli = path.join(cwd, 'bin/bronto-layout.mjs');
const run = args => spawnSync(process.execPath, [cli, ...args], {
  cwd, encoding: 'utf8', timeout: 45000, maxBuffer: 4 * 1024 * 1024,
  // The sandbox relaxation is for trusted bundled HTML fixtures only, not
  // external OSS websites; real-site CI retains the Chrome sandbox.
  env: { ...process.env, BRONTO_CHROME_NO_SANDBOX:'1', BRONTO_TEST_INLINE_FIXTURE:'1' }
});
function maybeSkip(t, result) {
  if (result.error?.code === 'ENOENT' ||
      /Cannot find Chrome\/Chromium/.test((result.stderr || '') + (result.stdout || ''))) {
    if (process.env.BRONTO_REQUIRE_CHROME === '1') throw new Error('CI needs Chromium');
    t.skip('Chromium unavailable');
    return true;
  }
  return false;
}

test('visible canvas makes known paint coverage gap explicit; hidden canvas does not count', t => {
  const args = ['audit', '--url', 'examples/audit-visible-canvas.html', '--width', '375',
    '--json', '--compact'];
  const result = run(args);
  if (maybeSkip(t, result)) return;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const d = JSON.parse(result.stdout);
  assert.equal(d.summary.measuredIssues, 0);
  assert.equal(d.summary.partialViewports, 1);
  assert.equal(d.summary.incompleteViewports, 0);
  assert.equal(d.reports[0].summary.verified, false);
  assert.equal(d.reports[0].summary.supportedScopeMeasured, true);
  assert.equal(d.reports[0].coverage.visibleCanvases, 1);
  assert.equal(d.reports[0].coverage.embeddedFrames, 0);
  assert.equal(d.reports[0].coverage.status, 'known-uninspected-content');
  assert.equal(d.reports[0].findings.filter(f => f.code === 'canvas-content-uninspected').length, 1);
  assert.equal(d.reports[0].findings.find(f => f.code === 'canvas-content-uninspected').count, 1);
  const strict = run([...args, '--fail-on-coverage-gaps']);
  assert.equal(strict.status, 2, strict.stderr || strict.stdout);
});

test('focussed accessibility skip link is excluded while genuinely clipped text remains a review lead', t => {
  const result = run(['audit','--url','examples/audit-focus-skiplink.html',
    '--width','375','--json','--compact']);
  if (maybeSkip(t, result)) return;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const d = JSON.parse(result.stdout);
  assert.equal(d.summary.measuredIssues, 0);
  assert.equal(d.summary.reviewWarnings, 1, JSON.stringify(d.reports[0].findings));
  assert.equal(d.reports[0].coverage.visuallyHiddenTextExcluded, 1);
  assert.equal(d.reports[0].coverage.visibleCanvases, 0);
  assert.equal(d.reports[0].findings[0].code, 'possible-text-clipping');
  assert.equal(d.reports[0].findings[0].path, '#visible-clipped');
  assert.ok(d.reports[0].findings[0].measuredPx > 2);
});
