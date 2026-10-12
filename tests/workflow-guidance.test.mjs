import test from 'node:test';
import assert from 'node:assert/strict';
import {
 describeSuggestedContracts,describeProposalReview,describeApprovedContract
} from '../dist/workflow-guidance.js';

const draft={draftSchemaVersion:1,url:'https://example.test/',widths:[375,768],selectors:{},
 proposals:[{id:'document-horizontal-fit',sampledWidths:[375,768],
  rationale:'No document overflow was observed',reviewRequired:true,
  rule:{id:'document-horizontal-fit',type:'document-overflow'},deviations:[]}],
 coverage:{groupAliases:[],candidateCount:10,truncated:true,limitReasons:['unique-selector-limit']},
 limitations:[]};

test('the suggestion message provides safe next-step commands but never approves a proposal',()=>{
 const guidance=describeSuggestedContracts(draft,'/tmp/layout draft.json');
 assert.match(guidance,/0?1 unapproved layout candidates/);
 assert.match(guidance,/PARTIAL SELECTOR DISCOVERY: unique-selector-limit/);
 assert.match(guidance,/review-draft --draft "\/tmp\/layout draft.json"/);
 assert.match(guidance,/--accept RULE_ID/);
 assert.match(guidance,/No rule was approved/);
 const missing=describeSuggestedContracts(draft);
 assert.match(missing,/Save the draft with --out FILE/);
 assert.doesNotMatch(missing,/review-draft --draft/);
});

test('review text includes observed deviations and correct units, not blanket layout quality',()=>{
 const data={mode:'review-draft',sourceUrl:'source',candidateUrl:'candidate',widths:[375,768],
  sourceDiscoveryTruncated:false,sourceLimitReasons:[],
  summary:{total:3,stillSatisfied:1,changed:1,unverified:1},proposals:[
    {id:'spacing',status:'changed',checkedWidths:[375],observations:[
      {width:375,status:'changed',findingStatus:'fail',findingCode:'constraint',
       unit:'px',deviation:12,tolerance:2,message:'Bad gap'}]},
    {id:'aspect',status:'still-satisfied',checkedWidths:[768],observations:[
      {width:768,status:'still-satisfied',findingStatus:'pass',findingCode:'constraint',
       unit:'%',deviation:0.05,tolerance:0.5,message:'Aspect'}]},
    {id:'missing',status:'unverified',checkedWidths:[375],observations:[
      {width:375,status:'unverified',findingStatus:'skip',findingCode:'measurement-unavailable',
       unit:'count',message:'Missing page element'}]}
  ]};
 const rendered=describeProposalReview(data);
 assert.match(rendered,/CHANGED: spacing/);
 assert.match(rendered,/375px: Δ 12px \(tolerance 2px\)/);
 assert.match(rendered,/768px: Δ 0.05% \(tolerance 0.5%\)/);
 assert.match(rendered,/375px: unverified \(Missing page element\)/);
 assert.match(rendered,/No proposal was approved/);
});

test('post-approval guidance uses the actual contract file and warns about untested elements',()=>{
 const text=describeApprovedContract('/tmp/accepted layout.json',2);
 assert.match(text,/Approved 2 explicitly reviewed rules/);
 assert.match(text,/validate --spec "\/tmp\/accepted layout.json"/);
 assert.match(text,/check --spec "\/tmp\/accepted layout.json"/);
 assert.match(text,/rest of the design remains outside the contract/);
});
