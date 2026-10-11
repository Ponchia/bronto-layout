import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateLayout} from '../dist/core.js';
const rect=(x,y,width,height)=>({x,y,width,height});
const sample=(width=100)=>({viewport:{width,height:100,direction:'ltr'},document:{width,height:100},selectors:{
 a:[{tag:'div',path:'#a',rect:rect(0,0,20,20)}],
 b:[{tag:'div',path:'#b',rect:rect(30,0,20,20)}],
 c:[{tag:'div',path:'#c',rect:rect(60,0,20,20)}],
 image:[{tag:'img',path:'#image',rect:rect(0,0,200,100),naturalSize:{width:400,height:200}}]
}});
test('rules are deterministic and pure',()=>{
 const s=sample(),before=JSON.stringify(s);
 const rules=[{id:'gaps',type:'equal-gaps',elements:['a','b','c'],axis:'x'},{id:'image',type:'image-aspect',element:'image'},{id:'cent',type:'centered',element:'b',in:'viewport',axis:'x',tolerance:10}];
 assert.equal(evaluateLayout(s,rules).summary.failed,0);
 assert.equal(JSON.stringify(s),before);
});
test('reports exact edge deviations',()=>{
 const result=evaluateLayout(sample(),[{id:'right',type:'align-edge',a:'a',b:'b',edgeA:'right',tolerance:1}]);
 assert.equal(result.summary.failed,1);
 assert.equal(result.findings[0].deviation,30);
});
test('uses RTL logical edges',()=>{
 const s=sample();s.viewport.direction='rtl';
 const result=evaluateLayout(s,[{id:'logical',type:'align-edge',a:'a',b:'b',edgeA:'inline-start',edgeB:'inline-end'}]);
 assert.equal(result.findings[0].deviation,10);
});
test('marks skipped conditions but never silently skips missing targets',()=>{
 const rules=[{id:'later',type:'align-edge',a:'a',b:'b',edgeA:'left',minWidth:200},{id:'miss',type:'align-edge',a:'a',b:'unknown',edgeA:'left'}];
 const result=evaluateLayout(sample(),rules);
 assert.equal(result.summary.skipped,1);
 assert.equal(result.summary.failed,1);
 assert.match(result.findings[1].message,/Missing element/);
});
test('detects document overflow and rejects unacceptable tolerances',()=>{
 const s=sample();s.document.width=133;
 const result=evaluateLayout(s,[{id:'overflow',type:'document-overflow',tolerance:1}]);
 assert.equal(result.findings[0].deviation,33);
 assert.equal(result.findings[0].status,'fail');
 assert.throws(()=>evaluateLayout(s,[{id:'broken',type:'document-overflow',tolerance:-1}]),/Invalid tolerance/);
});
test('detects containment and overlap',()=>{
 const s=sample();s.selectors.b[0].rect.x=15;
 const result=evaluateLayout(s,[{id:'overlap',type:'non-overlapping',a:'a',b:'b'},{id:'contain',type:'contained',element:'b',in:'a'}]);
 assert.equal(result.summary.failed,2);
});
test('logical alignment uses the computed direction of each element, not only the page',()=>{
 const s=sample();
 s.selectors.a[0].styles={direction:'rtl'};
 s.selectors.b[0].styles={direction:'ltr'};
 const report=evaluateLayout(s,[{id:'local-dir',type:'align-edge',a:'a',b:'b',edgeA:'inline-start',edgeB:'inline-start'}]);
 assert.equal(report.findings[0].deviation,10);
});
