import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const cwd = path.resolve(import.meta.dirname, '..');
const cli = path.join(cwd, 'bin/bronto-layout.mjs');
const env = { ...process.env, BRONTO_CHROME_NO_SANDBOX: '1',
  BRONTO_TEST_INLINE_FIXTURE: '1' }; // Self-contained trusted local HTML only.

function run(name) {
  return spawnSync(process.execPath, [
    cli, 'audit', '--url', 'examples/' + name + '.html',
    '--width', '320', '--json', '--compact'
  ], { cwd, env, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 40000 });
}
function shouldSkip(t, result) {
  if (result.error?.code === 'ENOENT' ||
      /Cannot find Chrome\/Chromium/.test(result.stderr || '')) {
    if (process.env.BRONTO_REQUIRE_CHROME === '1')
      throw new Error('CI requires Chromium for overflow candidate testing');
    t.skip('Chromium unavailable');
    return true;
  }
  return false;
}

test('a contained horizontal scroller does not create document overflow', t => {
  const r = run('overflow-clipped-control');
  if (shouldSkip(t, r)) return;
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const audit = JSON.parse(r.stdout);
  assert.equal(audit.summary.measuredIssues, 0);
  assert.equal(audit.summary.incompleteViewports, 0);
});

test('real root overflow retains a measured error but excludes inner clipped code from leading evidence', t => {
  const r = run('overflow-clipped-leads');
  if (shouldSkip(t, r)) return;
  assert.equal(r.status, 1, r.stderr || r.stdout);
  const audit = JSON.parse(r.stdout);
  assert.equal(audit.summary.measuredIssues, 1);
  assert.equal(audit.summary.incompleteViewports, 0);
  const finding = audit.reports[0].findings.find(x => x.code === 'document-horizontal-overflow');
  assert.equal(finding?.classification, 'measured');
  assert.ok(finding.measuredPx >= 8 && finding.measuredPx <= 30,
    'The independent root overflow is still reported: ' + JSON.stringify(finding));
  assert.ok(finding.overflowCandidates?.some(x => x.path === '#headline'),
    'The actual visible overhang must remain an attributed candidate');
  assert.ok(!finding.overflowCandidates?.some(x => /code|nested-scroll/.test(x.path)),
    'An internally clipped long code line must not outrank or impersonate a root overflow cause');
});

test('minimum-width clipped root retains true extent without blaming oversized code in a local scroller', t => {
  const r = run('overflow-clipped-narrow-root');
  if (shouldSkip(t, r)) return;
  assert.equal(r.status, 1, r.stderr || r.stdout);
  const audit = JSON.parse(r.stdout);
  assert.equal(audit.summary.measuredIssues, 1);
  const lead = audit.reports[0].findings.find(f => f.code === 'document-horizontal-overflow');
  assert.ok(lead.measuredPx >= 5 && lead.measuredPx < 30,
    'The scrollbar-reduced scrollport should leave a small document overhang');
  assert.match(lead.message, /horizontal clipping; this width difference does not by itself prove user-visible scrolling/);
  assert.ok(lead.overflowCandidates?.some(c => c.path === '#top-bar'),
    'The actual root-width header should remain an overflow observation');
  assert.ok(!lead.overflowCandidates?.some(c => c.path.includes('code')),
    'Clip-contained 900px code must not be ranked as a root-overflow culprit');
});
