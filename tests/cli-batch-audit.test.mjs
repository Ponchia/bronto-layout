import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const root=path.resolve(import.meta.dirname,'..');
const cli=path.join(root,'bin/bronto-layout.mjs');
const run=args=>spawnSync(process.execPath,[cli,...args],{
 cwd:root,encoding:'utf8',timeout:160000,maxBuffer:16*1024*1024,
 env:{...process.env,BRONTO_CHROME_NO_SANDBOX:'1',BRONTO_TEST_INLINE_FIXTURE:'1'}
});
function noChrome(t,result){
 if(result.error?.code==='ENOENT'||/Cannot find Chrome\/Chromium/.test(result.stdout+result.stderr)){
  if(process.env.BRONTO_REQUIRE_CHROME==='1')throw new Error('Chromium required in CI');
  t.skip('Chromium unavailable');return true;
 }
 return false;
}

test('four zero-contract audit jobs preserve mechanical errors and separate nonblocking review leads',t=>{
 const child=run(['batch','--manifest','examples/batch-audit.json','--parallel','2','--json','--compact']);
 if(noChrome(t,child))return;
 assert.equal(child.status,1,child.stderr||child.stdout);
 const report=JSON.parse(child.stdout);
 assert.equal(report.mode,'batch');
 assert.equal(report.summary.total,4);
 assert.equal(report.summary.errors,0);
 assert.deepEqual(report.jobs.map(j=>[j.id,j.mode,j.status]),[
  ['clean-375','audit','pass'],
  ['broken-375','audit','measured-issues'],
  ['opened-panel-375','audit','measured-issues'],
  ['grid-review-375','audit','pass']
 ]);
 assert.deepEqual([report.summary.passed,report.summary.violations,report.summary.auditJobsWithIssues],[2,0,2]);
 assert.equal(report.summary.checksPassed,0);
 assert.equal(report.summary.checksFailed,0);
 assert.equal(report.summary.auditMeasuredIssues,4);
 assert.ok(report.summary.auditReviewWarnings>=2);
 assert.equal(report.summary.auditIncompleteViewports,0);
 const stateful=report.jobs[2].result;
 assert.equal(stateful.mode,'audit');
 assert.equal(stateful.stateSetup.actionCount,4);
 assert.equal(stateful.summary.measuredIssues,2);
 const review=report.jobs[3].result;
 assert.equal(review.summary.measuredIssues,0);
 assert.equal(review.summary.reviewWarnings,1);
 assert.equal(review.reports[0].findings[0].classification,'review');
 assert.equal(review.reports[0].findings[0].code,'possible-grid-gap-anomaly');
 assert.doesNotMatch(child.stdout,/sensitive-demo-input-do-not-leak/);
});

test('mixed legacy contract and automatic audit batch preserves both result shapes',t=>{
 const child=run(['batch','--manifest','examples/batch-mixed.json','--json','--compact']);
 if(noChrome(t,child))return;
 assert.equal(child.status,1,child.stderr||child.stdout);
 const r=JSON.parse(child.stdout);
 assert.equal(r.summary.total,2);
 assert.deepEqual(r.jobs.map(job=>[job.mode,job.status,job.result.mode]),[
  ['check','pass','check'],['audit','measured-issues','audit']
 ]);
 assert.ok(r.summary.checksPassed>0);
 assert.equal(r.summary.checksFailed,0);
 assert.equal(r.summary.auditMeasuredIssues,2);
 assert.equal(r.summary.auditJobsWithIssues,1);
 assert.equal(r.summary.violations,0);
 assert.equal(r.jobs[1].result.reports[0].coverage.traversalLimit,25000);
});

test('strict per-job iframe coverage propagates unknown scope as a batch runtime/unverified error',t=>{
 const child=run(['batch','--manifest','examples/batch-audit-partial.json','--json','--compact']);
 if(noChrome(t,child))return;
 assert.equal(child.status,2,child.stderr||child.stdout);
 const r=JSON.parse(child.stdout);
 assert.equal(r.summary.total,2);
 assert.equal(r.summary.errors,1);
 assert.equal(r.summary.passed,1);
 assert.equal(r.summary.auditMeasuredIssues,0);
 assert.equal(r.jobs[1].status,'error');
 assert.equal(r.jobs[1].exitCode,2);
 assert.equal(r.jobs[1].mode,'audit');
 assert.equal(r.jobs[1].result.summary.partialViewports,1);
 assert.equal(r.jobs[1].result.reports[0].coverage.status,'known-uninspected-content');
});

test('audit-batch dry-run validates action files and never prints filled values',()=>{
 const child=run(['batch','--manifest','examples/batch-audit.json','--dry-run','--json']);
 assert.equal(child.status,0,child.stderr||child.stdout);
 const plan=JSON.parse(child.stdout);
 assert.equal(plan.mode,'batch-plan');
 assert.equal(plan.total,4);
 assert.deepEqual(plan.jobs.map(x=>x.mode),Array(4).fill('audit'));
 assert.equal(plan.jobs[2].stateSetup.actionCount,4);
 assert.equal(plan.jobs[3].auditOptions.gridGapReview,true);
 assert.equal(plan.jobs[0].spec,null);
 assert.doesNotMatch(child.stdout,/sensitive-demo-input-do-not-leak/);
});

test('invalid audit-batch action file rejects entire suite before creating browser evidence',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'bronto-audit-batch-invalid-'));
 try {
  const manifest=path.join(dir,'bad.json');
  const evidence=path.join(dir,'no-evidence-must-be-created');
  const source=path.join(root,'examples/audit-healthy.html');
  const illegal=path.join(dir,'unsafe.json');
  writeFileSync(illegal,JSON.stringify([{type:'evaluate',script:'alert(1)'}]));
  writeFileSync(manifest,JSON.stringify({schemaVersion:1,jobs:[
   {id:'otherwise-valid',mode:'audit',url:source,widths:[375]},
   {id:'invalid-action',mode:'audit',url:source,widths:[375],actions:'unsafe.json'}
  ]}));
  const child=run(['batch','--manifest',manifest,'--evidence-dir',evidence,'--json']);
  assert.equal(child.status,2,child.stderr||child.stdout);
  assert.equal(JSON.parse(child.stdout).mode,'error');
  assert.match(JSON.parse(child.stdout).error.message,/unsupported type/);
  assert.equal(existsSync(evidence),false);
  // A deliberate empty browser-permitted contract without --spec remains invalid.
  writeFileSync(manifest,JSON.stringify({schemaVersion:1,jobs:[
   {id:'wrong',mode:'audit',url:source,spec:'../layout.json'}
  ]}));
  const schema=run(['batch','--manifest',manifest,'--dry-run','--json']);
  assert.equal(schema.status,2);
  assert.match(JSON.parse(schema.stdout).error.message,/zero-contract/);
 } finally {rmSync(dir,{recursive:true,force:true});}
});

test('batch screenshot directories remain isolated between independently audited routes',t=>{
 const rootDir=mkdtempSync(path.join(os.tmpdir(),'bronto-batch-audit-evidence-'));
 try {
  const screenshots=path.join(rootDir,'evidence');
  const runResult=run(['batch','--manifest','examples/batch-audit.json',
    '--parallel','2','--evidence-dir',screenshots,'--json','--compact']);
  if(noChrome(t,runResult))return;
  assert.equal(runResult.status,1,runResult.stderr||runResult.stdout);
  const output=JSON.parse(runResult.stdout);
  for(const job of output.jobs){
   assert.equal(job.mode,'audit');
   assert.equal(job.result.reports.length,1);
   const png=path.join(screenshots,job.id,'audit-375px.png');
   assert.equal(existsSync(png),true,png);
   assert.equal(job.result.reports[0].screenshot.file,png);
   const image=readFileSync(png);
   assert.deepEqual([...image.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  }
 } finally{rmSync(rootDir,{recursive:true,force:true});}
});
