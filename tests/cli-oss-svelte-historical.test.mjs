import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(cwd, 'bin/bronto-layout.mjs');

function run(args) {
  return spawnSync(process.execPath, [cli, ...args, '--json'], {
    cwd, encoding: 'utf8', timeout: 40000, maxBuffer: 5 * 1024 * 1024,
    // Only trusted, inert, checked-in HTML is allowed in this local fixture.
    env: { ...process.env, BRONTO_TEST_INLINE_FIXTURE: '1',
      BRONTO_CHROME_NO_SANDBOX: '1' }
  });
}
function skipChrome(t, result) {
  if (result.error?.code === 'ENOENT' ||
      /Cannot find Chrome\/Chromium/.test(result.stderr || '')) {
    if (process.env.BRONTO_REQUIRE_CHROME === '1')
      throw new Error('Chromium required for historical OSS fixture tests in CI');
    t.skip('Chrome not installed');
    return true;
  }
  return false;
}

test('source-inspired historical CSS pair differs only by the Svelte min-height fix and label', () => {
  const broken = readFileSync(path.join(cwd, 'examples/oss-svelte-flex-min-broken.html'), 'utf8');
  const fixed = readFileSync(path.join(cwd, 'examples/oss-svelte-flex-min-fixed.html'), 'utf8');
  assert.ok(broken.includes('Svelte PR #548'));
  assert.equal((broken.match(/min-height:0;/g) ?? []).length, 0);
  assert.equal((fixed.match(/min-height:0;/g) ?? []).length, 1);
  assert.equal(
    broken.replace('— broken</title>', '— fixed</title>')
      .replace('height:100%;\n      background', 'height:100%; min-height:0;\n      background'),
    fixed,
    'Only the historically motivated CSS fix may change layout'
  );
});

test('explicit semantic contract detects obscured mobile input/output switch while generic overflow remains green', t => {
  const broken = run(['check', '--spec', 'examples/oss-svelte-flex-min.json',
    '--url', 'examples/oss-svelte-flex-min-broken.html', '--height', '420']);
  if (skipChrome(t, broken)) return;
  assert.equal(broken.status, 1, broken.stderr || broken.stdout);
  const report = JSON.parse(broken.stdout);
  assert.equal(report.summary.failed, 2);
  assert.equal(report.summary.skipped, 0);
  const failed = report.reports.flatMap(r => r.findings.filter(f => f.status === 'fail'));
  assert.equal(failed.length, 2);
  assert.ok(failed.every(f => f.id === 'switch-remains-in-viewport' &&
    f.deviation === 58), 'Both mobile viewports must detect the same occlusion');
  assert.ok(report.reports.every(r =>
    r.findings.some(f => f.id === 'switch-present' && f.status === 'pass') &&
    r.findings.some(f => f.id === 'document-width-fits' && f.status === 'pass')
  ));
  const audit = run(['audit', '--url', 'examples/oss-svelte-flex-min-broken.html',
    '--width', '375', '--height', '420']);
  assert.equal(audit.status, 0, audit.stderr || audit.stdout);
  const measured = JSON.parse(audit.stdout);
  assert.equal(measured.summary.measuredIssues, 0);
  assert.equal(measured.summary.incompleteViewports, 0);
  assert.equal(measured.summary.reviewWarnings, 0);
});

test('single-source min-height:0 correction restores visible toggle and passes existing contracts', t => {
  const fixed = run(['check', '--spec', 'examples/oss-svelte-flex-min.json',
    '--url', 'examples/oss-svelte-flex-min-fixed.html', '--height', '420']);
  if (skipChrome(t, fixed)) return;
  assert.equal(fixed.status, 0, fixed.stderr || fixed.stdout);
  const report = JSON.parse(fixed.stdout);
  assert.equal(report.summary.passed, 6);
  assert.equal(report.summary.failed, 0);
  assert.equal(report.summary.skipped, 0);
  assert.deepEqual(report.reports.map(r => r.viewport.width), [320, 375]);
  assert.ok(report.reports.every(r => r.findings.some(f =>
    f.id === 'switch-remains-in-viewport' && f.status === 'pass'
  )));
});
