import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeFrameInventory } from '../dist/frame-inventory.js';
const root={frame:{id:'root',url:'https://example.net/start'},childFrames:[
 {frame:{id:'a',parentId:'root',url:'https://user:secret@another.test/frame?q=private#fragment'}},
 {frame:{id:'b',parentId:'root',url:'about:srcdoc'}}
]};
const snapshot={strings:['root','a','b'],documents:[
 {frameId:0,nodes:{nodeType:[9,1,1]},layout:{nodeIndex:[0,1]}},
 {frameId:1,nodes:{nodeType:[9,1,1,1]},layout:{nodeIndex:[0,1,2]}}
]};
test('counts all declared child frames and discloses unobserved documents without leaking URL tokens',()=>{
 const result=summarizeFrameInventory(root,snapshot);
 assert.equal(result.status,'partial-frame-evidence');
 assert.equal(result.frameCount,2);
 assert.equal(result.reportedFrames,2);
 assert.equal(result.observedFrameDocuments,1);
 assert.equal(result.missingFrameDocuments,1);
 assert.equal(result.unlinkedSnapshotDocuments,0);
 assert.equal(result.frames[0].url,'https://another.test/frame');
 assert.equal(result.frames[0].layoutObjects,3);
 assert.equal(result.frames[1].snapshotDocument,false);
 assert.doesNotMatch(JSON.stringify(result.frames),/secret|private|fragment/);
 assert.ok(result.limitations.some(line=>line.includes('not a verification')));
});
test('complete declared-frame linkage still never certifies inner-frame layout quality',()=>{
 const result=summarizeFrameInventory(root,{...snapshot,documents:[...snapshot.documents,{frameId:2,nodes:{nodeType:[9]},layout:{nodeIndex:[]}}]});
 assert.equal(result.status,'frame-documents-observed');
 assert.equal(result.observedFrameDocuments,2);
 assert.equal(result.frames[1].layoutObjects,0);
 assert.match(result.limitations.join(' '),/NOT|not a verification/i);
});
test('frame-free pages do not require or fabricate a DOMSnapshot',()=>{
 const result=summarizeFrameInventory({frame:{id:'root',url:'https://example.net'}},undefined);
 assert.equal(result.status,'no-child-frames');
 assert.deepEqual(result.frames,[]);
 assert.equal(result.snapshotDocuments,0);
});
test('bounded inventories report omitted frames rather than silently treating them as covered',()=>{
 const frames=Array.from({length:65},(_,i)=>({frame:{id:'frame-'+i,parentId:'root',url:'data:text/html,hello'}}));
 const result=summarizeFrameInventory({frame:{id:'root'},childFrames:frames},{strings:['root'],documents:[{frameId:0}]});
 assert.equal(result.frameCount,65);
 assert.equal(result.reportedFrames,48);
 assert.equal(result.omittedFrames,17);
 assert.equal(result.missingFrameDocuments,65);
 assert.equal(result.status,'bounded-frame-evidence');
 assert.ok(result.frames.every(frame=>frame.url==='[non-http frame URL]'));
});
test('malformed CDP frame trees are rejected rather than counted as complete',()=>{
 assert.throws(()=>summarizeFrameInventory({frame:{id:''}},undefined),/Invalid/);
 assert.throws(()=>summarizeFrameInventory(root,{documents:[],strings:null}),/did not return/);
});

test('visible frames missing from Page.getFrameTree never count as an all-clear',()=>{
 const result=summarizeFrameInventory({frame:{id:'root'}},undefined,1);
 assert.equal(result.status,'partial-frame-evidence');
 assert.equal(result.frameCount,0);
 assert.equal(result.domVisibleFrames,1);
 assert.equal(result.unresolvedDomFrames,1);
 assert.equal(result.observedFrameDocuments,0);
});
