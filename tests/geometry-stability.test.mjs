import test from 'node:test';
import assert from 'node:assert/strict';
import { compareLayoutGeometry, truncatedGeometryAliases } from '../dist/geometry-stability.js';
import { evaluateLayout } from '../dist/core.js';
import { parseBatchManifest } from '../dist/batch.js';

const elem = (path, x, y, width=100, height=30) => ({
  path, tag: 'div', rect: { x, y, width, height },
  clientSize: { width, height }, scrollSize: { width, height },
  fragments: [ { x, y, width, height } ]
});
const snapshot = (elements=[elem('#a',10,15), elem('#b',120,15)]) => ({
  viewport: { width: 375, height: 900, contentWidth: 375, direction: 'ltr' },
  document: { width: 375, height: 900 },
  selectors: { items: elements },
  selectorCounts: { items: elements.length }
});
test('identical geometry and reordered DOM matches do not look unstable', () => {
  const a=snapshot(), b=snapshot([...a.selectors.items].reverse());
  assert.deepEqual(compareLayoutGeometry(a,b), {
    stable:true,maxDeltaPx:0,changedAliases:[],reasons:[]
  });
});
test('tolerance avoids subpixel jitter but detects sustained drift from quiet-window reference', () => {
  const original=snapshot();
  const jitter=snapshot([elem('#a',10.3,15),elem('#b',120,15)]);
  const moving=snapshot([elem('#a',10.8,15),elem('#b',120,15)]);
  assert.equal(compareLayoutGeometry(original,jitter,.5).stable,true);
  const difference=compareLayoutGeometry(original,moving,.5);
  assert.equal(difference.stable,false);
  assert.deepEqual(difference.changedAliases,['items']);
  assert.ok(difference.maxDeltaPx > .5);
});
test('document growth, identity changes and wrapping fragments are observable', () => {
  const initial=snapshot();
  const grown=structuredClone(initial);
  grown.document.height += 60;
  assert.deepEqual(compareLayoutGeometry(initial,grown).changedAliases,['document']);
  const replaced=snapshot([elem('#a',10,15),elem('#c',120,15)]);
  assert.ok(compareLayoutGeometry(initial,replaced).reasons.some(s=>s.includes('lost element')));
  const wrapped=structuredClone(initial);
  wrapped.selectors.items[0].fragments.push({x:10,y:45,width:50,height:30});
  assert.equal(compareLayoutGeometry(initial,wrapped).stable,false);
});
test('a truncated selector cannot certify that all matching elements stopped moving', () => {
  const sampled=snapshot([elem('#a',0,0)]);
  sampled.selectorCounts.items=300;
  assert.deepEqual(truncatedGeometryAliases(sampled),['items']);
  assert.deepEqual(truncatedGeometryAliases(snapshot()),[]);
});
test('nonsensical geometry tolerances are rejected and observed metadata persists', () => {
  assert.throws(()=>compareLayoutGeometry(snapshot(),snapshot(),-1),/nonnegative/);
  const sampled=snapshot();
  sampled.stabilization={
    status:'stable',stableForMs:600,waitedMs:660,samples:8,
    changesObserved:1,largestObservedDeltaPx:80,epsilonPx:.5
  };
  const report=evaluateLayout(sampled,[{id:'count',type:'selector-count',element:'items',exactly:2}]);
  assert.equal(report.stabilization.waitedMs,660);
  assert.equal(report.summary.passed,1);
});
test('batch manifests accept bounded stabilization waits, not scripts or arbitrary lengths', () => {
  const manifest={schemaVersion:1,jobs:[{id:'stable',spec:'layout.json',stableFor:850}]};
  assert.equal(parseBatchManifest(manifest).jobs[0].stableFor,850);
  for(const value of [-1,0,99,5001,'100',null]) {
    assert.throws(()=>parseBatchManifest({schemaVersion:1,jobs:[{id:'unstable',spec:'layout.json',stableFor:value}]}),/stableFor/);
  }
});
