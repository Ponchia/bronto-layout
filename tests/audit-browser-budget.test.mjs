import test from 'node:test';
import assert from 'node:assert/strict';
import {capturePageAuditObservations} from '../dist/audit-browser.js';

test('160k sibling elements use a bounded work stack rather than spread arguments',()=>{
  const previousDocument = globalThis.document;
  const previousStyles = globalThis.getComputedStyle;
  // The first (root) element is visible; its children are hidden, so only
  // queue sizing/traversal matter. 100k spread arguments exceeds V8's maximum
  // call arguments on many platforms. This fixture does not open a browser.
  const n=160000;
  let first,previous;
  for(let i=0;i<n;i++){
    const next={nextElementSibling:null,children:[],firstElementChild:null};
    if(previous)previous.nextElementSibling=next;
    else first=next;
    previous=next;
  }
  const root={getBoundingClientRect:()=>({width:0,height:0}),children:{length:n, [Symbol.iterator]:function*(){for(let x=first;x;x=x.nextElementSibling)yield x;}},
    firstElementChild:first, nextElementSibling:null};
  globalThis.document={documentElement:root};
  globalThis.getComputedStyle=element=>({display:element===root?'block':'none'});
  try {
    const report=capturePageAuditObservations(1000);
    assert.equal(report.visitedElements,1000);
    assert.equal(report.traversalLimit,1000);
    assert.equal(report.truncated,true);
    assert.equal(report.visibleElements,0);
  } finally {
    if(previousDocument===undefined)delete globalThis.document;
    else globalThis.document=previousDocument;
    if(previousStyles===undefined)delete globalThis.getComputedStyle;
    else globalThis.getComputedStyle=previousStyles;
  }
});
