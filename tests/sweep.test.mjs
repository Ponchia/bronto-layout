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
