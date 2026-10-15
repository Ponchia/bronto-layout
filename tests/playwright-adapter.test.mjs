import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPlaywrightPage } from '../dist/playwright.js';
import { parseContract } from '../dist/contract.js';

const spec = {
  schemaVersion:1,widths:[375],selectors:{heading:'#heading',content:'#content'},rules:[
    {id:'heading-aligns-content',type:'align-edge',a:'heading',b:'content',edgeA:'left',tolerance:1}
  ]
};
const rect = x => ({x,y:10,width:150,height:30});
const snap=x=>({viewport:{width:375,height:900,direction:'ltr'}, document:{width:375,height:900},
  selectors:{heading:[{path:'#heading',tag:'h1',rect:rect(10)}],content:[{path:'#content',tag:'main',rect:rect(x)}]},
  selectorCounts:{heading:1,content:1}});

test('uses Playwright-style evaluate without launching a browser or replaying state',async()=>{
  let expression='';
  const page={evaluate:async e=>{expression=e;return snap(10);}};
  const report=await checkPlaywrightPage(page,spec);
  assert.deepEqual(report.summary,{passed:1,failed:0,skipped:0});
  assert.match(expression,/captureDOMGeometry|capture = \(function captureDOMGeometry/);
  assert.match(expression,/queryComposedElements/);
  assert.match(expression,/#heading/);
  assert.doesNotMatch(expression,/eval\(|Function\(/);
});

test('reuses identical approved rules for healthy and semantic regressions',async()=>{
  const good=await checkPlaywrightPage({evaluate:async()=>snap(10)},spec);
  const bad=await checkPlaywrightPage({evaluate:async()=>snap(22)},spec);
  assert.equal(good.summary.passed,1);
  assert.equal(bad.summary.failed,1);
  assert.equal(bad.findings[0].deviation,12);
});

test('never claims a passing test for missing, mismatched or absent viewports',async()=>{
  await assert.rejects(checkPlaywrightPage({evaluate:async()=>snap(10)}, {...spec,widths:[1280]}),/does not match/);
  await assert.rejects(checkPlaywrightPage({evaluate:async()=>null},spec),/unverified/);
  await assert.rejects(checkPlaywrightPage({evaluate:async()=>({...snap(10),viewport:{width:120,direction:'ltr'}})},spec),/unverified/);
  const outside={...spec,rules:[{...spec.rules[0],minWidth:1000,maxWidth:1200}]};
  await assert.rejects(checkPlaywrightPage({evaluate:async()=>snap(10)},outside),/No applicable layout rules/);
});

test('declared actions and browser scenarios are never silently ignored',async()=>{
  const never={evaluate:async()=>{throw Error('should not access browser');}};
  await assert.rejects(checkPlaywrightPage(never,{...spec,actions:[{type:'click',selector:'#heading'}]}),/does not replay contract actions/);
  await assert.rejects(checkPlaywrightPage(never,{...spec,scenario:{locale:'ar'}}),/does not apply declared browser scenario/);
  assert.throws(()=>parseContract({...spec,rules:[{id:'arbitrary',type:'shell'}]}),/unsupported type/);
});

test('selector text is safely JSON-encoded inside library-owned script',async()=>{
  let expression='';
  const selector = `[data-input=";throw new Error('injected');/*"]`;
  await checkPlaywrightPage({evaluate:async e=>{expression=e;return snap(10);}},
    {...spec,selectors:{heading:selector,content:'#content'}});
  assert.ok(expression.includes(JSON.stringify(selector)));
  assert.doesNotMatch(expression,/\brequire\(|\bimport\(/);
});
