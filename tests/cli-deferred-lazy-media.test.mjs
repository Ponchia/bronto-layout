import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const cli = path.join(root, 'bin/bronto-layout.mjs');
const run = args => spawnSync(process.execPath, [cli, ...args, '--json', '--compact'], {
  cwd: root, encoding: 'utf8', timeout: 50000, maxBuffer: 5 * 1024 * 1024,
  // Untrusted web pages are NEVER launched with this override; these HTML
  // fixtures are local, trusted and inert under an isolated test runner.
  env: { ...process.env, BRONTO_TEST_INLINE_FIXTURE: '1', BRONTO_CHROME_NO_SANDBOX: '1' }
});
function missingChrome(t, r) {
  if (r.error?.code === 'ENOENT' ||
      /Cannot find Chrome\/Chromium/.test((r.stderr ?? '') + (r.stdout ?? ''))) {
    if (process.env.BRONTO_REQUIRE_CHROME === '1') throw new Error('Chromium required by CI');
    t.skip('Chromium not installed');
    return true;
  }
  return false;
}

test('offscreen lazy media is not an ordinary pending image warning but has honest coverage', t => {
  const r = run(['audit', '--url', 'examples/audit-offscreen-lazy.html', '--widths', '375,1280']);
  if (missingChrome(t, r)) return;
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const audit = JSON.parse(r.stdout);
  assert.equal(audit.summary.measuredIssues, 0);
  assert.equal(audit.summary.reviewWarnings, 0);
  assert.equal(audit.summary.partialViewports, 2);
  for (const view of audit.reports) {
    assert.equal(view.coverage.deferredOffscreenLazyImages, 1, JSON.stringify(view));
    assert.equal(view.coverage.totalImages, 1);
    assert.equal(view.coverage.status, 'known-uninspected-content');
    assert.equal(view.summary.supportedScopeMeasured, true);
    assert.equal(view.summary.verified, false);
    assert.ok(view.coverage.limitations.some(x => x.includes('offscreen loading=lazy image')));
    assert.ok(!view.findings.some(x => x.code === 'pending-image'));
  }
  const strict = run(['audit', '--url', 'examples/audit-offscreen-lazy.html',
    '--width', '375', '--fail-on-coverage-gaps']);
  assert.equal(strict.status, 2, strict.stderr || strict.stdout);
});

test('after scrolling into view, the same lazy image is loaded and paint gap disappears', t => {
  const r = run(['audit', '--url', 'examples/audit-offscreen-lazy.html', '--width', '375',
    '--actions', 'examples/audit-offscreen-lazy-actions.json']);
  if (missingChrome(t, r)) return;
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const audit = JSON.parse(r.stdout);
  assert.equal(audit.reports[0].coverage.deferredOffscreenLazyImages, 0);
  assert.equal(audit.reports[0].coverage.status, 'supported-scope-measured');
  assert.equal(audit.reports[0].summary.verified, true);
  assert.equal(audit.summary.measuredIssues, 0);
  assert.equal(audit.summary.reviewWarnings, 0);
  assert.ok(audit.reports[0].scrollY > 2000);
});

test('a visible lazy image with unfinished loading remains a review-only pending image', t => {
  const r = run(['audit', '--url', 'examples/audit-visible-pending.html', '--width', '375']);
  if (missingChrome(t, r)) return;
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const audit = JSON.parse(r.stdout);
  assert.equal(audit.summary.measuredIssues, 0);
  assert.equal(audit.summary.reviewWarnings, 1);
  assert.equal(audit.reports[0].coverage.deferredOffscreenLazyImages, 0);
  assert.equal(audit.reports[0].coverage.status, 'supported-scope-measured');
  assert.equal(audit.reports[0].findings[0].code, 'pending-image');
  assert.equal(audit.reports[0].findings[0].count, 1);
});
