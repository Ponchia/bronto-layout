import test from 'node:test';
import assert from 'node:assert/strict';
import { planBoundedScreenshot, BOUNDED_CAPTURE_LIMITS } from '../dist/bounded-screenshot.js';
const metrics=(width,height)=>({cssContentSize:{width,height}});
test('a normal document is captured entirely at the current CSS layout state',()=>{
 const result=planBoundedScreenshot(375,metrics(375,2850));
 assert.equal(result.coverage,'rendered-document-rectangle');
 assert.deepEqual(result.clip,{x:0,y:0,width:375,height:2850,scale:1});
 assert.equal(result.truncatedVertically,false);
 assert.equal(result.truncatedHorizontally,false);
 assert.match(result.limitations.join(' '),/Lazy-loaded/);
});
test('tall evidence is clipped to 6000 CSS pixels and explicitly reported as partial',()=>{
 const result=planBoundedScreenshot(375,metrics(375,9400));
 assert.equal(result.coverage,'bounded-top-left-rectangle');
 assert.equal(result.capturedHeight,6000);
 assert.equal(result.documentHeight,9400);
 assert.equal(result.truncatedVertically,true);
 assert.equal(result.truncatedHorizontally,false);
});
test('pixel-area and horizontal caps bound oversized screenshots without silently claiming complete',()=>{
 const wide=planBoundedScreenshot(1280,metrics(8000,9400));
 assert.equal(wide.capturedWidth,BOUNDED_CAPTURE_LIMITS.maxWidth);
 assert.equal(wide.truncatedHorizontally,true);
 assert.ok(wide.capturedWidth*wide.capturedHeight<=BOUNDED_CAPTURE_LIMITS.maxCssPixels);
 assert.ok(wide.truncatedVertically);
 const big=planBoundedScreenshot(4000,metrics(4000,3000));
 assert.equal(big.capturedWidth*big.capturedHeight,12_000_000);
 assert.equal(big.coverage,'rendered-document-rectangle');
});
test('invalid or incomplete Chromium CSS layout metrics never become a false complete result',()=>{
 for(const input of [null,{}, {cssContentSize:{}},metrics(NaN,900),metrics(375,Infinity),metrics(375,-4)]){
  assert.throws(()=>planBoundedScreenshot(375,input),/metrics unavailable/);
 }
 assert.throws(()=>planBoundedScreenshot(0,metrics(375,900)),/metrics unavailable/);
});
