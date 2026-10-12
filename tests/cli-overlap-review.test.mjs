import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const cwd=path.resolve(import.meta.dirname,'..');
const cli=path.join(cwd,'bin/bronto-layout.mjs');
const run=args=>spawnSync(process.execPath,[cli,...args],{
 cwd,encoding:'utf8',timeout:80000,maxBuffer:8*1024*1024,
 env:{...process.env,BRONTO_CHROME_NO_SANDBOX:'1',BRONTO_TEST_INLINE_FIXTURE:'1'}
});
function noChrome(t,r){
 if(r.error?.code==='ENOENT' || /Cannot find Chrome\/Chromium/.test(r.stderr+r.stdout)){
  if(process.env.BRONTO_REQUIRE_CHROME==='1')throw new Error('Chromium required by CI');
  t.skip('Chromium unavailable');return true;
 }
 return false;
}
const healthy='examples/audit-overlap-healthy.html';
const broken='examples/audit-overlap-broken.html';

test('grid siblings overlap after a transform: opt-in REVIEW only, default stays unchanged',t=>{
 const args=['audit','--url',broken,'--width','375','--json','--compact'];
 const ordinary=run(args);
 if(noChrome(t,ordinary))return;
 assert.equal(ordinary.status,0,ordinary.stderr||ordinary.stdout);
 assert.equal(JSON.parse(ordinary.stdout).summary.reviewWarnings,0);
 assert.equal(JSON.parse(ordinary.stdout).summary.reviewCoverage,undefined,
  'default audit should not claim experimental review inspection');
 const checked=run([...args,'--sibling-overlap-review','--grid-gap-review']);
 assert.equal(checked.status,0,checked.stderr||checked.stdout);
 const report=JSON.parse(checked.stdout);
 assert.equal(report.summary.measuredIssues,0);
 assert.equal(report.summary.reviewWarnings,1);
 assert.equal(report.reports[0].findings[0].code,'possible-sibling-overlap');
 assert.equal(report.reports[0].findings[0].classification,'review');
 assert.equal(report.reports[0].findings[0].measuredPx,29);
 assert.deepEqual(report.reports[0].findings[0].relatedPaths.map(x=>x.includes('.card')), [true,true]);
 assert.equal(report.reports[0].coverage.overlapContainersInspected,1);
 assert.equal(report.reports[0].coverage.overlapContainersOmitted,0);
 assert.equal(report.reports[0].coverage.siblingOverlapCount,1);
 assert.equal(report.reports[0].coverage.omittedSiblingOverlapLeads,0);
});

test('healthy grid and intentional negative-margin avatars/absolute overlays are not flagged',t=>{
 for(const page of [healthy,'examples/audit-overlap-intentional.html']){
  const r=run(['audit','--url',page,'--width','375','--sibling-overlap-review','--json','--compact']);
  if(noChrome(t,r))return;
  assert.equal(r.status,0,r.stderr||r.stdout);
  const data=JSON.parse(r.stdout);
  assert.equal(data.summary.measuredIssues,0);
  assert.equal(data.summary.reviewWarnings,0,data.reports[0].findings.map(f=>f.message).join('; '));
 }
});

test('new and worsening sibling overlap are nonblocking review changes in automatic comparisons',t=>{
 const fresh=run(['audit','--baseline',healthy,'--url',broken,'--width','375',
  '--sibling-overlap-review','--json','--compact']);
 if(noChrome(t,fresh))return;
 assert.equal(fresh.status,0,fresh.stderr||fresh.stdout);
 const detected=JSON.parse(fresh.stdout);
 assert.equal(detected.summary.measuredRegressions,0);
 assert.equal(detected.summary.reviewChanges,1);
 assert.equal(detected.summary.unverifiedViewports,0);
 assert.equal(detected.changes[0].kind,'review-new');
 assert.equal(detected.changes[0].code,'possible-sibling-overlap');
 const worse=run(['audit','--baseline',broken,'--url','examples/audit-overlap-worse.html',
  '--width','375','--sibling-overlap-review','--json','--compact']);
 assert.equal(worse.status,0,worse.stderr||worse.stdout);
 const delta=JSON.parse(worse.stdout);
 assert.equal(delta.summary.measuredRegressions,0);
 assert.equal(delta.summary.reviewChanges,1);
 assert.equal(delta.changes[0].kind,'review-worsened');
 assert.equal(delta.changes[0].baselineValue,29);
 assert.equal(delta.changes[0].candidateValue,44);
});

test('interactive hidden flex gallery only triggers review after validated click, with bounded DOM budget',t=>{
 const base=['audit','--url','examples/audit-overlap-stateful.html',
  '--width','375','--sibling-overlap-review','--json','--compact'];
 const hidden=run(base);
 if(noChrome(t,hidden))return;
 assert.equal(hidden.status,0,hidden.stderr||hidden.stdout);
 assert.equal(JSON.parse(hidden.stdout).summary.reviewWarnings,0);
 const opened=run([...base,'--actions','examples/audit-overlap-actions.json','--dom-limit','25000']);
 assert.equal(opened.status,0,opened.stderr||opened.stdout);
 const report=JSON.parse(opened.stdout);
 assert.equal(report.summary.reviewWarnings,1);
 assert.equal(report.summary.measuredIssues,0);
 assert.equal(report.reports[0].coverage.traversalLimit,25000);
 assert.deepEqual(report.stateSetup.actionTypes,['wait-for','click']);
});

test('dense grid discloses skipped candidate in audit and marks comparison unverified',t=>{
 const url='examples/audit-overlap-dense.html';
 const base=['audit','--url',url,'--width','375','--sibling-overlap-review','--json','--compact'];
 const r=run(base);
 if(noChrome(t,r))return;
 assert.equal(r.status,0,r.stderr||r.stdout);
 const report=JSON.parse(r.stdout);
 assert.equal(report.summary.reviewWarnings,0);
 assert.equal(report.summary.reviewCoverage.status,'known-omissions');
 assert.equal(report.summary.reviewCoverage.omittedOverlapContainers,1);
 assert.equal(report.summary.reviewCoverage.totalOmissions,1);
 assert.equal(report.reports[0].coverage.overlapContainersOmitted,1);
 assert.equal(report.reports[0].coverage.overlapContainersInspected,1);
 assert.ok(report.reports[0].coverage.limitations.some(s=>/overlap.*omitt/i.test(s)));
 const compared=run([...base,'--baseline',healthy]);
 assert.equal(compared.status,2,compared.stderr||compared.stdout);
 const delta=JSON.parse(compared.stdout);
 assert.equal(delta.summary.unverifiedViewports,1);
 assert.equal(delta.reviewCoverage.baseline.status,'no-known-omissions');
 assert.equal(delta.reviewCoverage.candidate.status,'known-omissions');
 assert.equal(delta.reviewCoverage.candidate.omittedOverlapContainers,1);
 assert.match(delta.unverified[0].reasons.join(' '),/omitted candidate containers/i);
});

test('unsupported command options reject before launching Chromium',()=>{
 const result=run(['check','--spec','examples/gallery.json','--sibling-overlap-review','--json']);
 assert.equal(result.status,2,result.stderr||result.stdout);
 assert.match(JSON.parse(result.stdout).error.message,/applies only to audit/);
});
