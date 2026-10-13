import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const cwd = path.resolve(import.meta.dirname, '..');
const cli = path.join(cwd, 'bin/bronto-layout.mjs');
function run(args) {
  return spawnSync(process.execPath, [cli, ...args, '--json'], {
    cwd, encoding: 'utf8', timeout: 40000, maxBuffer: 6 * 1024 * 1024,
    // The only unsafe Chrome flag here is limited to our bundled inert HTML,
    // never a third-party URL or authenticated browser page.
    env: { ...process.env, BRONTO_TEST_INLINE_FIXTURE: '1', BRONTO_CHROME_NO_SANDBOX: '1' }
  });
}
function skipMissingChrome(t, result) {
  if (result.error?.code === 'ENOENT' ||
      /Cannot find Chrome\/Chromium/.test(result.stderr || '')) {
    if (process.env.BRONTO_REQUIRE_CHROME === '1') throw new Error('Chromium required in CI');
    t.skip('Chromium unavailable');
    return true;
  }
  return false;
}

test('scroll action records real document scroll offset and brings deep target into viewport', t => {
  const r = run(['check', '--spec', 'examples/scroll-deep.json']);
  if (skipMissingChrome(t, r)) return;
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const report = JSON.parse(r.stdout);
  assert.deepEqual(report.reports.map(x => x.viewport.width), [375, 1280]);
  for (const item of report.reports) {
    assert.equal(item.summary.failed, 0);
    assert.equal(item.summary.skipped, 0);
    assert.equal(item.viewport.scrollX, 0);
    assert.ok(item.viewport.scrollY > 4500 && item.viewport.scrollY < 5600,
      'Recorded viewport should prove the browser actually scrolled: ' + JSON.stringify(item.viewport));
    assert.ok(item.findings.some(f => f.id === 'deep-heading-inside-viewport' &&
      f.status === 'pass'));
  }
});

test('without scroll setup the same deep-heading vertical contract must fail, not silently pass', t => {
  const r = run(['check', '--spec', 'examples/scroll-deep-top-control.json']);
  if (skipMissingChrome(t, r)) return;
  assert.equal(r.status, 1, r.stderr || r.stdout);
  const report = JSON.parse(r.stdout);
  assert.equal(report.summary.failed, 2);
  for (const item of report.reports) {
    assert.equal(item.viewport.scrollY, 0);
    assert.ok(item.findings.some(f => f.id === 'deep-heading-inside-viewport' &&
      f.status === 'fail'));
  }
});

test('automatic audit preserves scrolled viewport evidence without declaring complete content coverage', t => {
  const r = run([
    'audit', '--url', 'examples/scroll-deep.html', '--width', '375',
    '--actions', 'examples/scroll-deep-actions.json'
  ]);
  if (skipMissingChrome(t, r)) return;
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const audit = JSON.parse(r.stdout);
  assert.equal(audit.summary.viewports, 1);
  assert.equal(audit.summary.measuredIssues, 0);
  assert.equal(audit.summary.incompleteViewports, 0);
  assert.ok(audit.reports[0].viewport.scrollY > 4500);
  assert.equal(audit.reports[0].viewport.scrollX, 0);
  assert.equal(audit.reports[0].coverage.status, 'supported-scope-measured');
});


test('agent compact check retains the actual deep browser state without reintroducing passing geometry', t => {
  const r = run(['check', '--spec', 'examples/scroll-deep.json', '--compact']);
  if (skipMissingChrome(t, r)) return;
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const checked = JSON.parse(r.stdout);
  assert.equal(checked.format, 'compact');
  assert.equal(checked.summary.failed, 0);
  assert.deepEqual(checked.sampledWidths, [375, 1280]);
  assert.equal(checked.failures.length, 0);
  assert.deepEqual(checked.scrollOffsets?.map(x => x.width), [375, 1280]);
  for (const sample of checked.scrollOffsets) {
    assert.equal(sample.scrollX, 0);
    assert.ok(sample.scrollY > 4500);
  }

  const control = run(['check', '--spec', 'examples/scroll-deep-top-control.json', '--compact']);
  if (skipMissingChrome(t, control)) return;
  assert.equal(control.status, 1, control.stderr || control.stdout);
  const original = JSON.parse(control.stdout);
  assert.equal('scrollOffsets' in original, false,
    'A top-of-page compact report should not imply a scrolled browser state');
});

test('compact external audit retains the actual document scroll offset', t => {
  const r = run([
    'audit', '--url', 'examples/scroll-deep.html', '--width', '375',
    '--actions', 'examples/scroll-deep-actions.json', '--compact'
  ]);
  if (skipMissingChrome(t, r)) return;
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const audit = JSON.parse(r.stdout);
  assert.equal(audit.format, 'compact');
  assert.equal(audit.reports[0].width, 375);
  assert.ok(audit.reports[0].scrollY > 4500);
  assert.equal(audit.reports[0].scrollX, 0);
});
