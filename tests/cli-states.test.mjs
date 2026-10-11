import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const cwd=path.resolve(import.meta.dirname,'..');
const cli=path.join(cwd,'bin/bronto-layout.mjs');
const run=(args)=>spawnSync(process.execPath,[cli,...args],{cwd,encoding:'utf8',timeout:40000,maxBuffer:8*1024*1024,env:{...process.env,BRONTO_TEST_INLINE_FIXTURE:'1'}});
function skipChrome(t,r){if(r.error?.code==='ENOENT'||/Cannot find Chrome\/Chromium/.test(r.stderr||'')){if (process.env.BRONTO_REQUIRE_CHROME === '1') throw new Error('Chromium is required for CI but was not found'); t.skip('Chrome unavailable');return true;}return false;}
test('CLI browser actions reach interactive application states before measuring',t=>{
 const r=run(['check','--spec','examples/stateful.json','--width','375','--json']);
 if(skipChrome(t,r))return;
 assert.equal(r.status,1,r.stderr);
 const report=JSON.parse(r.stdout);
 assert.equal(report.reports[0].findings[0].deviation,28);
});
test('CLI fill triggers input handlers rather than only replacing an HTML attribute',t=>{
 const r=run(['check','--spec','examples/stateful-fill.json','--json']);
 if(skipChrome(t,r))return;
 assert.equal(r.status,1,r.stderr);
 assert.equal(JSON.parse(r.stdout).reports[0].findings[0].deviation,12);
});
test('mobile and locale emulation are reflected in the DOM snapshot',t=>{
 const r=run(['inspect','--url','examples/stateful.html','--width','375','--mobile','--locale','ar','--selector','subject=.subject','--json']);
 if(skipChrome(t,r))return;
 assert.equal(r.status,0,r.stderr);
 const viewport=JSON.parse(r.stdout).snapshots[0].viewport;
 assert.equal(viewport.width,375);
 assert.equal(viewport.deviceScaleFactor,2);
 assert.equal(viewport.coarsePointer,true);
 assert.equal(viewport.locale,'ar');
});
test('opt-in evidence captures annotated PNG with machine-readable file reference',t=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'bronto-layout-evidence-'));
 try {
  const r=run(['check','--spec','examples/layout.json','--url','examples/broken.html','--width','768','--evidence-dir',dir,'--json']);
  if(skipChrome(t,r))return;
  assert.equal(r.status,1,r.stderr);
  const report=JSON.parse(r.stdout);
  assert.equal(report.evidence.length,1);
  const image=readFileSync(report.evidence[0].screenshot);
  assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.ok(image.length>1000);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
