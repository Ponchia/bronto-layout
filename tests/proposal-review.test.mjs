import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestLayoutContracts } from '../dist/contract-discovery.js';
import { reviewContractProposals } from '../dist/proposal-review.js';
const element = (path,x,y,width=220,height=80) => ({path,tag:'div',rect:{x,y,width,height}});
const makeSnapshot = (width, overflow=0) => ({
 viewport:{width,height:900,direction:'ltr'},document:{width:width+overflow,height:1600},
 selectors:{shell:[element('#shell',10,30,width-20)]},selectorCounts:{shell:1}
});
const selectors={shell:'#shell'};
const widths=[375,768];
const draft=()=>suggestLayoutContracts('https://example.test/',selectors,widths.map(w=>makeSnapshot(w)));
test('provisional suggestions remain factual, with exact viewport replay and no automatic approval',()=>{
 const data=draft();
 assert.ok(data.proposals.some(x=>x.id==='document-horizontal-fit'));
 const review=reviewContractProposals(data,'https://candidate.test/',widths.map(w=>makeSnapshot(w)));
 assert.equal(review.mode,'review-draft');
 assert.equal(review.summary.changed,0);
 assert.equal(review.summary.unverified,0);
 assert.equal(review.summary.stillSatisfied,review.summary.total);
 assert.equal(review.sourceUrl,'https://example.test/');
 assert.equal(review.candidateUrl,'https://candidate.test/');
 assert.ok(review.proposals.every(x=>x.status==='still-satisfied'&&x.observations.length===2));
 assert.match(review.limitations.join(' '),/unapproved/);
});
test('a newly observed overflow changes the measured proposal instead of being called stable',()=>{
 const review=reviewContractProposals(draft(),'https://candidate.test/',[makeSnapshot(375,30),makeSnapshot(768)]);
 const result=review.proposals.find(x=>x.id==='document-horizontal-fit');
 assert.equal(result.status,'changed');
 assert.equal(result.observations[0].status,'changed');
 assert.ok(result.observations[0].deviation>=30);
 assert.ok(review.summary.changed>=1);
});
test('missing or unsupported element geometry is unverified, never passing',()=>{
 const data=draft();
 const page=makeSnapshot(375);
 page.selectors.shell=[];
 page.selectorCounts.shell=0;
 const review=reviewContractProposals(data,'https://candidate.test/',[page,makeSnapshot(768)]);
 const item=review.proposals.find(x=>x.id==='contained-shell');
 assert.equal(item.status,'unverified');
 assert.equal(item.observations[0].status,'unverified');
 assert.ok(item.observations[0].findingCode==='missing-selector');
 assert.ok(review.summary.unverified>=1);
});
test('new viewport sets or invalid recorded samples refuse misleading comparisons',()=>{
 const data=draft();
 assert.throws(()=>reviewContractProposals(data,'https://example.test/',[makeSnapshot(375)]),/exactly/);
 assert.throws(()=>reviewContractProposals(data,'https://example.test/',[makeSnapshot(375),makeSnapshot(375)]),/exactly/);
 const changed=structuredClone(data);
 changed.proposals[0].sampledWidths=[999];
 assert.throws(()=>reviewContractProposals(changed,'https://example.test/',[makeSnapshot(375),makeSnapshot(768)]),/Invalid recorded/);
});
test('source candidate caps remain explicit on later rechecks',()=>{
 const data=suggestLayoutContracts('https://example.test/',selectors,widths.map(w=>makeSnapshot(w)),[],true,{},['unique-selector-limit']);
 const review=reviewContractProposals(data,'https://candidate.test/',[makeSnapshot(375),makeSnapshot(768)]);
 assert.equal(review.sourceDiscoveryTruncated,true);
 assert.deepEqual(review.sourceLimitReasons,['unique-selector-limit']);
});
