import test from 'node:test';
import assert from 'node:assert/strict';
import { parseContract } from '../dist/contract.js';
import { evaluateLayout } from '../dist/core.js';
const base = () => ({
  schemaVersion: 1, url: 'https://example.test/', widths: [375, 1280],
  selectors: {main: 'main', title: 'h1', footer: 'footer'},
  rules: [
    {id:'heading-aligned', type:'align-edge', a:'main', b:'title', edgeA:'left'},
    {id:'footer-count', type:'selector-count', element:'footer', exactly:1}
  ]
});
test('accepts a well-formed contract',()=>{
  const result = parseContract(base());
  assert.equal(result.rules.length, 2);
});
test('rejects unknown aliases and duplicate IDs',()=>{
  const missing = base();missing.rules[0].b='missing';
  assert.throws(()=>parseContract(missing),/undeclared selector alias/);
  const dup=base();dup.rules[1].id='heading-aligned';
  assert.throws(()=>parseContract(dup),/duplicate rule id/);
});
test('rejects invalid widths and unsafe rule parameters',()=>{
  const widths = base();widths.widths=[375,375];
  assert.throws(()=>parseContract(widths),/duplicates/);
  const tol=base();tol.rules[0].tolerance=-1;
  assert.throws(()=>parseContract(tol),/tolerance/);
  const scan=base();scan.rules[0].maxWidth=300;scan.rules[0].minWidth=400;
  assert.throws(()=>parseContract(scan),/minWidth exceeds maxWidth/);
});
test('ambiguous selectors fail with actionable code',()=>{
  const specimen = {
    viewport: {width:375,height:800,direction:'ltr'}, document: {width:375,height:800},
    selectors: {main:[{path:'main',tag:'main',rect:{x:0,y:0,width:375,height:500}}], title:[
      {path:'h1:nth-child(1)',tag:'h1',rect:{x:0,y:0,width:100,height:30}},
      {path:'h1:nth-child(2)',tag:'h1',rect:{x:0,y:50,width:100,height:30}}
    ]}
  };
  const report = evaluateLayout(specimen,[{id:'a',type:'align-edge',a:'main',b:'title',edgeA:'left'}]);
  assert.equal(report.summary.failed,1);
  assert.equal(report.findings[0].code,'ambiguous-selector');
});
test('unknown fields are rejected instead of silently changing the meaning of a contract',()=>{
  const bad=base();bad.rules[0].tolrance=5;
  assert.throws(()=>parseContract(bad),/unknown field tolrance/);
  const wrong=base();wrong.viewPorts=[320,400];
  assert.throws(()=>parseContract(wrong),/unknown top-level field viewPorts/);
});
test('interactive setup actions are bounded and strict',()=>{
 const good=base();good.actions=[{type:'click',selector:'#open'},{type:'wait-for',selector:'.dialog'},{type:'fill',selector:'input',value:'abc'}];
 assert.equal(parseContract(good).actions.length,3);
 const injected=base();injected.actions=[{type:'evaluate',code:'alert(1)'}];
 assert.throws(()=>parseContract(injected),/unsupported type/);
 const tooLong=base();tooLong.actions=[{type:'pause',milliseconds:99999}];
 assert.throws(()=>parseContract(tooLong),/0..5000/);
});
