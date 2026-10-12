import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const cwd=path.resolve(import.meta.dirname,'..');
const cli=path.join(cwd,'bin/bronto-layout.mjs');
const run=args=>spawnSync(process.execPath,[cli,...args],{
 cwd,encoding:'utf8',timeout:65000,maxBuffer:8*1024*1024,
 env:{...process.env,BRONTO_CHROME_NO_SANDBOX:'1',BRONTO_TEST_INLINE_FIXTURE:'1'}
});
function skipChrome(t,r){if(r.error?.code==='ENOENT'||/Cannot find Chrome\/Chromium/.test(r.stderr||'')){
 if(process.env.BRONTO_REQUIRE_CHROME==='1')throw new Error('Chrome required by CI');
 t.skip('Chromium unavailable');return true;
}return false;}
test('optional measured grid spacing difference is a review warning, never a strict failure',t=>{
 const args=['audit','--url','examples/gallery-broken.html','--width','375','--json','--compact'];
 const defaultRun=run(args);
 if(skipChrome(t,defaultRun))return;
 assert.equal(defaultRun.status,0,defaultRun.stderr||defaultRun.stdout);
 assert.equal(JSON.parse(defaultRun.stdout).summary.reviewWarnings,0);
 const selected=run([...args,'--grid-gap-review']);
 assert.equal(selected.status,0,selected.stderr||selected.stdout);
 const output=JSON.parse(selected.stdout);
 assert.equal(output.summary.measuredIssues,0);
 assert.equal(output.summary.reviewWarnings,1);
 const review=output.reports[0].findings[0];
 assert.equal(review.code,'possible-grid-gap-anomaly');
 assert.equal(review.classification,'review');
 assert.equal(review.measuredPx,12);
 assert.match(review.message,/16.0, 28.0px/);
 assert.equal(output.reports[0].coverage.gridContainersInspected,1);
 assert.equal(output.reports[0].coverage.gridContainersOmitted,0);
});
test('healthy equal gap grid is not warned and intentional space-between distribution is suppressed',t=>{
 const urls=['examples/gallery.html','examples/gallery-space-between.html'];
 for(const url of urls){
  const r=run(['audit','--url',url,'--width','768','--grid-gap-review','--json','--compact']);
  if(skipChrome(t,r))return;
  assert.equal(r.status,0,r.stderr||r.stdout);
  const result=JSON.parse(r.stdout);
  assert.equal(result.summary.reviewWarnings,0,result.reports[0].findings.map(f=>f.message).join(';'));
 }
});
test('opt-in audit comparison detects new grid spacing concern as REVIEW-ONLY',t=>{
 const r=run(['audit','--baseline','examples/gallery.html','--url','examples/gallery-broken.html',
   '--width','375','--grid-gap-review','--json','--compact']);
 if(skipChrome(t,r))return;
 assert.equal(r.status,0,r.stderr||r.stdout);
 const report=JSON.parse(r.stdout);
 assert.equal(report.summary.measuredRegressions,0);
 assert.equal(report.summary.reviewChanges,1);
 assert.equal(report.summary.unverifiedViewports,0);
 assert.equal(report.changes[0].code,'possible-grid-gap-anomaly');
 assert.equal(report.changes[0].kind,'review-new');
});
test('experimental spacing flag rejects unsupported commands before browser launch',()=>{
 const r=run(['check','--spec','examples/layout.json','--grid-gap-review','--json']);
 assert.equal(r.status,2);
 assert.match(JSON.parse(r.stdout).error.message,/applies only to audit/);
});

test('grid spacing collector explicitly discloses dense containers omitted from review',t=>{
 const r=run(['audit','--url','examples/gallery-grid-dense.html','--width','375',
   '--grid-gap-review','--json','--compact']);
 if(skipChrome(t,r))return;
 assert.equal(r.status,0,r.stderr||r.stdout);
 const result=JSON.parse(r.stdout);
 assert.equal(result.summary.measuredIssues,0);
 assert.equal(result.summary.reviewWarnings,0);
 assert.equal(result.reports[0].coverage.gridContainersOmitted,1);
 assert.ok(result.reports[0].coverage.limitations.some(l=>/grid.*omit/i.test(l)));
});

test('opt-in grid-spacing review observes explicitly opened UI states without promoting warnings to errors',t=>{
 const base=['audit','--url','examples/gallery-toggle-broken.html','--width','375',
  '--grid-gap-review','--json','--compact'];
 const initial=run(base);
 if(skipChrome(t,initial))return;
 assert.equal(initial.status,0,initial.stderr||initial.stdout);
 const untouched=JSON.parse(initial.stdout);
 assert.equal(untouched.summary.reviewWarnings,0);
 assert.equal(untouched.summary.measuredIssues,0);
 const active=run([...base,'--actions','examples/gallery-toggle-actions.json','--dom-limit','25000']);
 assert.equal(active.status,0,active.stderr||active.stdout);
 const found=JSON.parse(active.stdout);
 assert.equal(found.summary.measuredIssues,0);
 assert.equal(found.summary.reviewWarnings,1);
 assert.equal(found.reports[0].findings[0].code,'possible-grid-gap-anomaly');
 assert.equal(found.reports[0].findings[0].measuredPx,12);
 assert.deepEqual(found.stateSetup.actionTypes,['wait-for','click']);
 assert.equal(found.reports[0].coverage.gridContainersInspected,1);
 assert.equal(found.reports[0].coverage.traversalLimit,25000,
  'DOM budget, grid-gap review and interactive actions must coexist');
});
