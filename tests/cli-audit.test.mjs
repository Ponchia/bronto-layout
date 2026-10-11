import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const cwd=path.resolve(import.meta.dirname,'..');
const cli=path.join(cwd,'bin/bronto-layout.mjs');
function run(args) {
  return spawnSync(process.execPath,[cli,...args],{
    cwd,encoding:'utf8',timeout:90000,maxBuffer:8*1024*1024,
    env:{...process.env,BRONTO_CHROME_NO_SANDBOX:'1',BRONTO_TEST_INLINE_FIXTURE:'1'}
  });
}
function noChrome(t,r) {
  if(r.error?.code==='ENOENT'||/Cannot find Chrome\/Chromium/.test(r.stdout+r.stderr)){
    if(process.env.BRONTO_REQUIRE_CHROME==='1')throw new Error('Chromium is required by CI');
    t.skip('Chromium unavailable');return true;
  }
  return false;
}
test('no-contract CLI audit detects measured overflow and broken image separately from text review',t=>{
  const r=run(['audit','--url','examples/audit-broken.html',
    '--widths','320,768','--settle','350','--json','--compact']);
  if(noChrome(t,r))return;
  assert.equal(r.status,1,r.stderr||r.stdout);
  const data=JSON.parse(r.stdout);
  assert.equal(data.mode,'audit');
  assert.equal(data.format,'compact');
  assert.deepEqual(data.sampledWidths,[320,768]);
  assert.equal(data.summary.viewports,2);
  assert.equal(data.summary.incompleteViewports,0);
  assert.ok(data.summary.measuredIssues>=4,JSON.stringify(data.summary));
  assert.ok(data.summary.reviewWarnings>=2);
  for(const report of data.reports){
    assert.ok(report.findings.some(issue=>issue.code==='document-horizontal-overflow'&&issue.measuredPx>=40));
    assert.ok(report.findings.some(issue=>issue.code==='broken-image'&&issue.path==='#broken'));
    assert.ok(report.findings.some(issue=>issue.code==='possible-text-clipping'&&issue.path==='#clipped'));
    assert.equal(report.coverage.truncated,false);
  }
  assert.ok(data.reports[0].findings.some(issue=>issue.code==='broken-image'&&
    !issue.source.includes('?')));
});
test('audit avoids treating intentional scrolling and CSS ellipsis as errors',t=>{
  const r=run(['audit','--url','examples/audit-healthy.html',
    '--widths','320,375,768','--settle','150','--json']);
  if(noChrome(t,r))return;
  assert.equal(r.status,0,r.stderr||r.stdout);
  const data=JSON.parse(r.stdout);
  assert.equal(data.summary.measuredIssues,0,JSON.stringify(data.reports));
  assert.equal(data.summary.incompleteViewports,0);
  for(const report of data.reports){
    assert.equal(report.coverage.brokenImageCount,0);
    assert.equal(report.coverage.intentionalEllipses,1);
    assert.equal(report.coverage.visuallyHiddenTextExcluded,1);
    assert.equal(report.summary.errors,0);
    assert.equal(report.findings.filter(issue=>issue.code==='possible-text-clipping').length,0);
  }
});
test('audit without viewport configuration covers mobile, tablet and desktop widths',t=>{
  const r=run(['audit','--url','examples/audit-healthy.html','--json','--compact']);
  if(noChrome(t,r))return;
  assert.equal(r.status,0,r.stderr||r.stdout);
  assert.deepEqual(JSON.parse(r.stdout).sampledWidths,[320,375,768,1280]);
});
test('zero-contract audit finds a narrow CSS breakpoint overflow without a spec',t=>{
  const r=run(['audit','--url','examples/breakpoint.html','--scan','600:900:300',
    '--css-breakpoints','--json','--compact']);
  if(noChrome(t,r))return;
  assert.equal(r.status,1,r.stderr||r.stdout);
  const result=JSON.parse(r.stdout);
  assert.ok(result.cssBreakpointScan.thresholds.includes(701));
  assert.ok(result.sampledWidths.includes(701));
  assert.ok(result.sampledWidths.includes(799));
  assert.ok(result.reports.some(report=>report.findings.some(
    finding=>finding.code==='document-horizontal-overflow'&&finding.measuredPx>40)));
  assert.equal(result.reports.find(report=>report.width===600).summary.errors,0);
  assert.equal(result.reports.find(report=>report.width===900).summary.errors,0);
});
test('open Shadow DOM components with repeated local IDs have distinct observed locations',t=>{
  const r=run(['audit','--url','examples/audit-shadow-duplicate-ids.html',
    '--width','320','--settle','300','--json','--compact']);
  if(noChrome(t,r))return;
  assert.equal(r.status,1,r.stderr||r.stdout);
  const data=JSON.parse(r.stdout);
  assert.equal(data.summary.measuredIssues,2);
  const found=data.reports[0].findings.filter(f=>f.code==='broken-image').map(f=>f.path).sort();
  assert.deepEqual(found,['#host-a >>> #missing','#host-b >>> #missing']);
  assert.equal(data.reports[0].coverage.brokenImageCount,2);
});

test('audit input errors keep JSON error and documented exit 2',()=>{
  const r=run(['audit','--url','examples/audit-healthy.html',
    '--spec','examples/layout.json','--json']);
  assert.equal(r.status,2);
  assert.match(JSON.parse(r.stdout).error.message,/zero-contract/);
});
test('automatic audit refuses geometry stabilization without named child selectors',()=>{
  const r=run(['audit','--url','examples/audit-healthy.html',
    '--stable-for','400','--json']);
  assert.equal(r.status,2);
  assert.match(JSON.parse(r.stdout).error.message,/requires named selectors/);
});
test('audit rejects unsupported SARIF instead of silently omitting data',()=>{
  const r=run(['audit','--url','examples/audit-healthy.html','--sarif']);
  assert.equal(r.status,2,r.stderr||r.stdout);
});
