import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const cwd=path.resolve(import.meta.dirname,'..');
const cli=path.join(cwd,'bin/bronto-layout.mjs');
const run=args=>spawnSync(process.execPath,[cli,...args],{
  cwd,encoding:'utf8',timeout:90000,maxBuffer:8*1024*1024,
  env:{...process.env,BRONTO_CHROME_NO_SANDBOX:'1',BRONTO_TEST_INLINE_FIXTURE:'1'}
});
function noChrome(t,r) {
  if(r.error?.code==='ENOENT' || /Cannot find Chrome\/Chromium/.test(r.stdout+r.stderr)){
    if(process.env.BRONTO_REQUIRE_CHROME==='1')throw new Error('Chromium required by CI');
    t.skip('Chromium unavailable');return true;
  }
  return false;
}
function withPage(t, count = 20000) {
  const tmp=mkdtempSync(path.join(os.tmpdir(),'bronto-dom-budget-'));
  t.after(()=>rmSync(tmp,{recursive:true,force:true}));
  const file=path.join(tmp,'page.html');
  writeFileSync(file,'<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<style>html,body{margin:0}.item{width:8px;height:2px}</style></head><body><main>'+
    '<div class="item">x</div>'.repeat(count)+'</main></body></html>');
  return file;
}

test('bounded default audit flags large DOM as incomplete; explicit larger limit measures it',t=>{
  const file=withPage(t);
  const base=['audit','--url',file,'--width','375','--json','--compact'];
  const defaultResult=run(base);
  if(noChrome(t,defaultResult))return;
  assert.equal(defaultResult.status,2,defaultResult.stderr||defaultResult.stdout);
  const before=JSON.parse(defaultResult.stdout);
  assert.equal(before.summary.incompleteViewports,1);
  assert.equal(before.summary.partialViewports,1);
  assert.equal(before.summary.measuredIssues,0);
  assert.equal(before.reports[0].coverage.visitedElements,18000);
  assert.equal(before.reports[0].coverage.traversalLimit,18000);
  assert.equal(before.reports[0].coverage.truncated,true);
  const raised=run([...base,'--dom-limit','25000']);
  assert.equal(raised.status,0,raised.stderr||raised.stdout);
  const after=JSON.parse(raised.stdout);
  assert.equal(after.summary.incompleteViewports,0);
  assert.equal(after.summary.partialViewports,0);
  assert.equal(after.summary.measuredIssues,0);
  assert.equal(after.reports[0].coverage.traversalLimit,25000);
  assert.ok(after.reports[0].coverage.visitedElements>=20003);
  assert.equal(after.reports[0].coverage.truncated,false);
  assert.equal(after.reports[0].summary.verified,true);
});

test('same explicit DOM cap is honored on baseline and candidate',t=>{
  const file=withPage(t);
  const args=['audit','--baseline',file,'--url',file,'--width','375','--json','--compact'];
  const partial=run(args);
  if(noChrome(t,partial))return;
  assert.equal(partial.status,2,partial.stderr||partial.stdout);
  assert.equal(JSON.parse(partial.stdout).summary.unverifiedViewports,1);
  const expanded=run([...args,'--dom-limit','25000']);
  assert.equal(expanded.status,0,expanded.stderr||expanded.stdout);
  const report=JSON.parse(expanded.stdout);
  assert.equal(report.summary.unverifiedViewports,0);
  assert.equal(report.summary.measuredRegressions,0);
  assert.equal(report.summary.candidateMeasuredIssues,0);
  assert.equal(report.coverageGaps.length,0);
});

test('DOM traversal limit rejects invalid or unrelated flags before opening Chromium',()=>{
  for(const count of ['0','999','50001','3.5','-1','invalid']){
    const r=run(['audit','--url','examples/audit-healthy.html','--dom-limit',count,'--json']);
    assert.equal(r.status,2,r.stderr||r.stdout);
    assert.match(JSON.parse(r.stdout).error.message,/--dom-limit/);
  }
  const unrelated=run(['check','--spec','examples/layout.json','--dom-limit','25000','--json']);
  assert.equal(unrelated.status,2);
  assert.match(JSON.parse(unrelated.stdout).error.message,/applies only to audit/);
});
