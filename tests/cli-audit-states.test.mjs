import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const cwd=path.resolve(import.meta.dirname,'..');
const cli=path.join(cwd,'bin/bronto-layout.mjs');
const run=args=>spawnSync(process.execPath,[cli,...args],{
  cwd,encoding:'utf8',timeout:90000,maxBuffer:8*1024*1024,
  env:{...process.env,BRONTO_CHROME_NO_SANDBOX:'1',BRONTO_TEST_INLINE_FIXTURE:'1'}
});
const broken='examples/audit-stateful-broken.html';
const healthy='examples/audit-stateful-healthy.html';
const actions='examples/audit-stateful-actions.json';
function noChrome(t, process) {
  if (process.error?.code==='ENOENT' || /Cannot find Chrome\/Chromium/.test(process.stdout+process.stderr)) {
    if (globalThis.process.env.BRONTO_REQUIRE_CHROME==='1') throw new Error('Chromium required by CI');
    t.skip('Chromium unavailable');return true;
  }
  return false;
}

test('without requested interactions a hidden overflow and image stay out of the measured state',t=>{
  const r=run(['audit','--url',broken,'--width','375','--json','--compact']);
  if(noChrome(t,r))return;
  assert.equal(r.status,0,r.stderr||r.stdout);
  const report=JSON.parse(r.stdout);
  assert.equal(report.summary.measuredIssues,0);
  assert.equal(report.summary.partialViewports,0);
  assert.equal(report.stateSetup,undefined);
  assert.equal(report.reports[0].coverage.brokenImageCount,0);
});

test('explicit audited actions reveal measured stateful defects at every requested width',t=>{
  const r=run(['audit','--url',broken,'--actions',actions,'--widths','375,768',
    '--ready-selector','#open','--json','--compact']);
  if(noChrome(t,r))return;
  assert.equal(r.status,1,r.stderr||r.stdout);
  const data=JSON.parse(r.stdout);
  assert.deepEqual(data.sampledWidths,[375,768]);
  assert.equal(data.summary.viewports,2);
  assert.equal(data.summary.measuredIssues,4);
  assert.deepEqual(data.stateSetup,{
    actionCount:4,actionTypes:['wait-for','click','fill','wait-for'],
    replayedAtEachWidth:true
  });
  assert.doesNotMatch(r.stdout,/sensitive-demo-input-do-not-leak/);
  assert.doesNotMatch(r.stdout,/"selector": "#comment"/);
  for(const report of data.reports){
    assert.equal(report.summary.errors,2);
    assert.ok(report.findings.some(x=>x.code==='broken-image'&&x.path.includes('img')));
    assert.ok(report.findings.some(x=>x.code==='document-horizontal-overflow'&&x.measuredPx>=40));
    assert.equal(report.coverage.truncated,false);
  }
});

test('baseline/candidate automatic auditing replays the same explicit state independently',t=>{
  const control=run(['audit','--baseline',healthy,'--url',broken,'--width','375','--json','--compact']);
  if(noChrome(t,control))return;
  assert.equal(control.status,0,control.stderr||control.stdout);
  assert.equal(JSON.parse(control.stdout).summary.measuredRegressions,0);
  const replay=run(['audit','--baseline',healthy,'--url',broken,'--width','375',
    '--actions',actions,'--json','--compact']);
  assert.equal(replay.status,1,replay.stderr||replay.stdout);
  const result=JSON.parse(replay.stdout);
  assert.equal(result.mode,'audit-compare');
  assert.equal(result.summary.measuredRegressions,2);
  assert.equal(result.summary.measuredImprovements,0);
  assert.equal(result.summary.baselineMeasuredIssues,0);
  assert.equal(result.summary.candidateMeasuredIssues,2);
  assert.equal(result.summary.unverifiedViewports,0);
  assert.deepEqual(result.stateSetup,{actionCount:4,
    actionTypes:['wait-for','click','fill','wait-for'],
    replayedAtEachWidth:true,replayedOnBothVersions:true});
  assert.doesNotMatch(replay.stdout,/sensitive-demo-input-do-not-leak/);
});

test('audit screenshots reflect the explicit post-action browser state and report remains bounded',t=>{
  const tmp=mkdtempSync(path.join(os.tmpdir(),'bronto-stateful-audit-'));
  try{
    const runResult=run(['audit','--url',broken,'--actions',actions,'--width','375',
      '--evidence-dir',tmp,'--full-page-evidence','--json','--compact']);
    if(noChrome(t,runResult))return;
    assert.equal(runResult.status,1,runResult.stderr||runResult.stdout);
    const data=JSON.parse(runResult.stdout);
    const view=data.reports[0];
    assert.equal(view.summary.errors,2);
    assert.equal(view.screenshot.coverage,'viewport-only');
    assert.equal(view.fullPageScreenshot.truncatedVertically,false);
    for (const file of [view.screenshot.file,view.fullPageScreenshot.file]) {
      assert.equal(existsSync(file),true);
      const bytes=readFileSync(file);
      assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
    }
  } finally {rmSync(tmp,{recursive:true,force:true});}
});

test('invalid declarative steps or forbidden command combinations exit 2 before browser execution',()=>{
  const tmp=mkdtempSync(path.join(os.tmpdir(),'bronto-invalid-audit-actions-'));
  try{
    const invalidFile=path.join(tmp,'bad-actions.json');
    writeFileSync(invalidFile,JSON.stringify([{type:'evaluate',value:'alert(1)'}]));
    const unsafe=run(['audit','--url',broken,'--actions',invalidFile,'--json']);
    assert.equal(unsafe.status,2);
    assert.match(JSON.parse(unsafe.stdout).error.message,/unsupported type/);
    const invalidSchema=run(['audit','--url',broken,'--actions','examples/layout.json','--json']);
    assert.equal(invalidSchema.status,2);
    assert.match(JSON.parse(invalidSchema.stdout).error.message,/array of at most 30/);
    const wrongCommand=run(['check','--spec','examples/gallery.json','--actions',actions,'--json']);
    assert.equal(wrongCommand.status,2);
    assert.match(JSON.parse(wrongCommand.stdout).error.message,/applies only to suggest or audit/);
  } finally {rmSync(tmp,{recursive:true,force:true});}
});

test('responsive breakpoint discovery replays interactive state at every discovered viewport',t=>{
  const target='examples/audit-stateful-breakpoint.html';
  const base=['audit','--url',target,'--scan','600:900:300','--css-breakpoints','--json','--compact'];
  const initial=run(base);
  if(noChrome(t,initial))return;
  assert.equal(initial.status,0,initial.stderr||initial.stdout);
  assert.equal(JSON.parse(initial.stdout).summary.measuredIssues,0);
  const active=run([...base,'--actions',actions]);
  assert.equal(active.status,1,active.stderr||active.stdout);
  const report=JSON.parse(active.stdout);
  assert.ok(report.cssBreakpointScan.thresholds.includes(701));
  assert.ok(report.cssBreakpointScan.thresholds.includes(799));
  assert.ok(report.sampledWidths.includes(701));
  assert.ok(report.sampledWidths.includes(799));
  assert.equal(report.reports.find(x=>x.width===600).summary.errors,0);
  assert.equal(report.reports.find(x=>x.width===900).summary.errors,0);
  assert.ok(report.reports.some(x=>x.width>=701 && x.width<=799 &&
    x.findings.some(f=>f.code==='document-horizontal-overflow' && f.measuredPx>=40)));
  assert.equal(report.stateSetup.actionCount,4);
});
