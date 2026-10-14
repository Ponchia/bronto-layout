import test from 'node:test';
import assert from 'node:assert/strict';
import { sweepLayout, widthRange } from '../dist/sweep.js';
test('widthRange includes exact boundaries without drift', () => {
  assert.deepEqual(widthRange(320, 500, 80),[320,400,480,500]);
  assert.throws(()=>widthRange(320,8000,1), /maximum 200/);
});
test('sweep finds one-pixel status transition with refinement', async () => {
  const measured=[];
  const result=await sweepLayout([320,1280], async width=>{
    measured.push(width);
    const status=width>=701?'fail':'pass';
    return {viewport:{width,height:900,direction:'ltr'},summary:{passed:status==='pass'?1:0,failed:status==='fail'?1:0,skipped:0},findings:[{id:'alignment',type:'align-edge',status,message:'check'}]};
  },true);
  const transitions=result.transitions;
  assert.equal(transitions.length,1);
  assert.deepEqual([transitions[0].previousWidth,transitions[0].width], [700,701]);
  assert.equal(new Set(measured).size,measured.length);
});
test('sweep cannot prove invisible islands between equal endpoints',async()=>{
  const result=await sweepLayout([320,1280],async width=>({viewport:{width,height:900,direction:'ltr'},summary:{passed:1,failed:0,skipped:0},findings:[{id:'check',type:'document-overflow',status:'pass',message:''}]}),true);
  assert.equal(result.reports.length,2);
  assert.equal(result.transitions.length,0);
});

// Unlike endpoint-only refinement, bounded probes can reveal a hidden failing
// island and then locate both boundaries. Still not a proof between probes.
test('explicit interior probes reveal a pass/fail/pass responsive island', async () => {
  const measured=[];
  const check=async width=>{
    measured.push(width);
    const status=width>=390&&width<=410?'fail':'pass';
    return {viewport:{width,height:900,direction:'ltr'},
      summary:{passed:Number(status==='pass'),failed:Number(status==='fail'),skipped:0},
      findings:[{id:'island',type:'document-overflow',status,message:'observed'}]};
  };
  const coarse=await sweepLayout([320,480],check,true,200,0);
  assert.equal(coarse.reports.length,2);
  const probed=await sweepLayout([320,480],check,true,200,3);
  assert.deepEqual(probed.sampling.interiorWidths,[360,400,440]);
  assert.deepEqual(probed.transitions.map(t=>[t.previousWidth,t.width]),[[389,390],[410,411]]);
  assert.equal(probed.sampling.largestUntestedGapPx>0,true);
  assert.equal(new Set(measured.slice(2)).size,measured.length-2);
});
test('interior width budget is validated before navigating or evaluating', async()=>{
  let invoked=0;
  const fn=async()=>{invoked++;throw new Error('unexpected browser visit')};
  await assert.rejects(sweepLayout([320,480,640],fn,true,4,3),/needs 9 coarse\/probe widths/);
  await assert.rejects(sweepLayout([320],fn,true,200,9),/interiorProbes/);
  assert.equal(invoked,0);
});
