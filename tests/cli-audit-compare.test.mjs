import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const cwd = path.resolve(import.meta.dirname, '..');
const cli = path.join(cwd, 'bin/bronto-layout.mjs');
const run = args => spawnSync(process.execPath, [cli, ...args], {
  cwd, encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024,
  env: {
    ...process.env, BRONTO_CHROME_NO_SANDBOX: '1',
    BRONTO_TEST_INLINE_FIXTURE: '1'
  }
});
function noChrome(t, result) {
  if (result.error?.code === 'ENOENT' ||
      /Cannot find Chrome\/Chromium/.test(result.stdout + result.stderr)) {
    if (process.env.BRONTO_REQUIRE_CHROME === '1') throw new Error('Chromium required by CI');
    t.skip('Chromium unavailable'); return true;
  }
  return false;
}
test('automatic CLI comparison discovers new measured issues without written contracts', t => {
  const r = run(['audit', '--baseline', 'examples/audit-healthy.html',
    '--url', 'examples/audit-broken.html', '--width', '375', '--settle', '300',
    '--json', '--compact']);
  if (noChrome(t,r)) return;
  assert.equal(r.status,1,r.stderr||r.stdout);
  const data = JSON.parse(r.stdout);
  assert.equal(data.mode,'audit-compare');
  assert.equal(data.format,'compact');
  assert.deepEqual(data.sampledWidths,[375]);
  assert.equal(data.summary.measuredRegressions,2);
  assert.equal(data.summary.measuredImprovements,0);
  assert.equal(data.summary.reviewChanges,1);
  assert.equal(data.summary.unverifiedViewports,0);
  assert.equal(data.summary.candidateMeasuredIssues,2);
  assert.ok(data.changes.some(x=>x.code==='broken-image'&&x.path==='#broken'&&x.kind==='regression'));
  assert.ok(data.changes.some(x=>x.code==='document-horizontal-overflow'&&x.kind==='regression'));
  assert.ok(data.changes.some(x=>x.code==='possible-text-clipping'&&x.kind==='review-new'));
  assert.equal(data.remainingMeasuredIssues.length,2);
  assert.equal('baseline' in data,false);
  assert.equal('candidate' in data,false);
});
test('previously broken layout becoming healthy is an improvement with exit 0', t => {
  const r=run(['audit','--baseline','examples/audit-broken.html',
    '--url','examples/audit-healthy.html','--width','375','--settle','300',
    '--json','--compact']);
  if(noChrome(t,r))return;
  assert.equal(r.status,0,r.stderr||r.stdout);
  const result=JSON.parse(r.stdout);
  assert.equal(result.summary.measuredRegressions,0);
  assert.equal(result.summary.measuredImprovements,2);
  assert.equal(result.summary.reviewChanges,1);
  assert.equal(result.summary.candidateMeasuredIssues,0);
  assert.deepEqual(result.remainingMeasuredIssues,[]);
});
test('existing defects are retained, not counted again as regressions',t=>{
  const r=run(['audit','--baseline','examples/audit-broken.html',
    '--url','examples/audit-broken.html','--width','375','--settle','300',
    '--json','--compact']);
  if(noChrome(t,r))return;
  assert.equal(r.status,0,r.stderr||r.stdout);
  const result=JSON.parse(r.stdout);
  assert.equal(result.summary.measuredRegressions,0);
  assert.equal(result.summary.candidateMeasuredIssues,2);
  assert.equal(result.changes.length,0);
  assert.equal(result.remainingMeasuredIssues.length,2);
});
test('breakpoints from candidate and baseline catch a regression missed by coarse endpoints',t=>{
  const r=run(['audit','--baseline','examples/breakpoint-healthy.html',
    '--url','examples/breakpoint.html','--scan','600:900:300',
    '--css-breakpoints','--json','--compact']);
  if(noChrome(t,r))return;
  assert.equal(r.status,1,r.stderr||r.stdout);
  const result=JSON.parse(r.stdout);
  assert.ok(result.sampledWidths.includes(701));
  assert.ok(result.sampledWidths.includes(799));
  assert.ok(result.summary.measuredRegressions>0);
  assert.ok(result.changes.some(change=>change.code==='document-horizontal-overflow'&&
    change.width>=701 && change.width<=799));
  assert.ok(!result.changes.some(change=>change.width===600 || change.width===900));
  assert.ok(result.cssBreakpointScan.thresholds.includes(701));
});
test('human-readable output contains real lines and clear risk classes',t=>{
  const r=run(['audit','--baseline','examples/audit-healthy.html',
    '--url','examples/audit-broken.html','--width','375','--settle','300']);
  if(noChrome(t,r))return;
  assert.equal(r.status,1,r.stderr||r.stdout);
  assert.match(r.stdout,/\n  375px REGRESSION broken-image/);
  assert.match(r.stdout,/\n  375px REVIEW-NEW possible-text-clipping/);
  assert.doesNotMatch(r.stdout,/\\n  375px/);
});
test('invalid baseline locations and unsupported combinations return JSON error with exit 2',()=>{
  const invalid=run(['audit','--baseline','does-not-exist.html',
    '--url','examples/audit-healthy.html','--width','375','--json']);
  assert.equal(invalid.status,2);
  assert.equal(JSON.parse(invalid.stdout).mode,'error');
  const unrelated=run(['validate','--spec','examples/layout.json',
    '--baseline','examples/audit-healthy.html','--json']);
  assert.equal(unrelated.status,2);
  assert.match(JSON.parse(unrelated.stdout).error.message,/only to compare or audit/);
});

test('adding a healthy image before an existing failed image does not produce a false regression',t=>{
  const r=run(['audit','--baseline','examples/audit-reordered-baseline.html',
    '--url','examples/audit-reordered-candidate.html','--width','375','--settle','200',
    '--json','--compact']);
  if(noChrome(t,r))return;
  assert.equal(r.status,0,r.stderr||r.stdout);
  const result=JSON.parse(r.stdout);
  assert.equal(result.summary.baselineMeasuredIssues,1);
  assert.equal(result.summary.candidateMeasuredIssues,1);
  assert.equal(result.summary.measuredRegressions,0);
  assert.equal(result.summary.measuredImprovements,0);
  assert.equal(result.summary.unverifiedViewports,0);
  assert.deepEqual(result.changes,[]);
});
