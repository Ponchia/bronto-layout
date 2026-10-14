import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const bin=path.join(root,'bin/bronto-layout.mjs');
const run=args=>spawnSync(process.execPath,[bin,...args],{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024,
  env:{...process.env,BRONTO_TEST_INLINE_FIXTURE:'1',BRONTO_CHROME_NO_SANDBOX:'1'}});
function skipChrome(t,result){
 if(result.status===2&&/Cannot find Chrome\/Chromium/.test(result.stdout+result.stderr)){
  if(process.env.BRONTO_REQUIRE_CHROME==='1')throw new Error('CI requires Chromium');
  t.skip('Chromium unavailable');return true;
 }
 return false;
}
test('real Chromium catches an invisible-between-endpoints overflow with opt-in interior probes',t=>{
 const result=run(['check','--spec','examples/responsive-island.json','--interior-probes','3','--json','--compact']);
 if(skipChrome(t,result))return;
 assert.equal(result.status,1,result.stderr||result.stdout);
 const json=JSON.parse(result.stdout);
 assert.deepEqual(json.sampledWidths,[320,360,400,440,480]);
 assert.deepEqual(json.sampling.interiorWidths,[360,400,440]);
 assert.equal(json.sampling.largestUntestedGapPx,39);
 assert.deepEqual(json.failures.map(x=>x.width),[400]);
});
test('comparison samples the same interior widths on both revisions',t=>{
 const result=run(['compare','--spec','examples/responsive-island.json',
  '--baseline','examples/responsive-island-healthy.html','--url','examples/responsive-island.html',
  '--interior-probes','3','--json','--compact']);
 if(skipChrome(t,result))return;
 assert.equal(result.status,1,result.stderr||result.stdout);
 const json=JSON.parse(result.stdout);
 assert.equal(json.summary.regressions,1);
 assert.deepEqual(json.sampledWidths,[320,360,400,440,480]);
 assert.deepEqual(json.sampling.interiorWidths,[360,400,440]);
});
test('batch dry run exposes its sampling/strict policy before any browser execution',()=>{
 const result=run(['batch','--manifest','examples/batch-interior.json','--dry-run','--json']);
 assert.equal(result.status,0,result.stderr||result.stdout);
 const job=JSON.parse(result.stdout).jobs[0];
 assert.equal(job.interiorProbes,3);
 assert.equal(job.refine,true);
 assert.equal(job.failOnSkip,true);
});

test('bounded batch forwards interior probes and refinement to the real child CLI',t=>{
 const result=run(['batch','--manifest','examples/batch-interior.json','--json','--compact']);
 if(skipChrome(t,result))return;
 assert.equal(result.status,1,result.stderr||result.stdout);
 const json=JSON.parse(result.stdout);
 assert.equal(json.jobs[0].status,'violations');
 assert.deepEqual(json.jobs[0].result.sampling.interiorWidths,[360,400,440]);
 assert.deepEqual(json.jobs[0].result.transitions.map(v=>[v.previousWidth,v.width]),[[389,390],[410,411]]);
});
