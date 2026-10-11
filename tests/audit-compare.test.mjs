import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePageAudits } from '../dist/audit-compare.js';

const finding = (code, path, px=0) => ({
  code, classification: code==='broken-image'||code==='document-horizontal-overflow'?'measured':'review',
  severity: code==='broken-image'||code==='document-horizontal-overflow'?'error':'warning',
  message:code,
  ...(path?{path}:{}),
  ...(px?{measuredPx:px}:{})
});
const page = (width=375, findings=[], patch={}) => ({
  viewport:{width,height:900,contentWidth:width,direction:'ltr'},
  coverage:{
    visitedElements:50,traversalLimit:18000,truncated:false,visibleElements:47,
    totalImages:3,unloadedImages:0,
    brokenImageCount:findings.filter(f=>f.code==='broken-image').length,
    brokenImages:[],omittedBrokenImages:0,
    textClipCount:findings.filter(f=>f.code==='possible-text-clipping').length,
    textClips:[],omittedTextClips:0,
    intentionalEllipses:0,visuallyHiddenTextExcluded:0,embeddedFrames:0,
    ...(patch.coverage??{})
  },
  summary:{
    errors:findings.filter(f=>f.severity==='error').length,
    warnings:findings.filter(f=>f.severity==='warning').length,
    verified:true,...(patch.summary??{})
  },
  findings
});
const healthy=()=>page();
const broken=()=>page(375,[
  finding('document-horizontal-overflow',undefined,50),
  finding('broken-image','#missing'),
  finding('possible-text-clipping','#label',30)
]);
const compare=(before,after)=>comparePageAudits('https://baseline.test/','https://candidate.test/',[before],[after]);

test('new measured overflow and broken-image evidence are regressions, clipping is review-only',()=>{
  const r=compare(healthy(),broken());
  assert.equal(r.mode,'audit-compare');
  assert.equal(r.summary.measuredRegressions,2);
  assert.equal(r.summary.measuredImprovements,0);
  assert.equal(r.summary.reviewChanges,1);
  assert.equal(r.summary.unverifiedViewports,0);
  assert.equal(r.changes.filter(x=>x.kind==='regression').length,2);
  assert.ok(r.changes.some(x=>x.code==='broken-image'&&x.path==='#missing'));
  assert.ok(r.changes.some(x=>x.code==='possible-text-clipping'&&x.kind==='review-new'));
});

test('an automatic baseline defect disappearing counts as an improvement, not a regression',()=>{
  const r=compare(broken(),healthy());
  assert.equal(r.summary.measuredRegressions,0);
  assert.equal(r.summary.measuredImprovements,2);
  assert.equal(r.summary.reviewChanges,1);
  assert.ok(r.changes.some(x=>x.code==='possible-text-clipping'&&x.kind==='review-resolved'));
});

test('unchanged pre-existing defects do not become new regressions',()=>{
  const r=compare(broken(),broken());
  assert.equal(r.changes.length,0);
  assert.equal(r.summary.candidateMeasuredIssues,2);
  assert.equal(r.summary.baselineMeasuredIssues,2);
});

test('a measured overflow worsening by two pixels counts; subpixel noise does not',()=>{
  const changed=page(375,[finding('document-horizontal-overflow',undefined,52)]);
  const original=page(375,[finding('document-horizontal-overflow',undefined,50)]);
  const small=page(375,[finding('document-horizontal-overflow',undefined,50.5)]);
  assert.equal(compare(original,changed).summary.measuredRegressions,1);
  assert.equal(compare(original,small).summary.measuredRegressions,0);
  assert.equal(compare(changed,original).summary.measuredImprovements,1);
});

test('new warnings alone do not count as a measured regression',()=>{
  const r=compare(healthy(),page(375,[finding('possible-text-clipping','#a',17)]));
  assert.equal(r.summary.measuredRegressions,0);
  assert.equal(r.summary.reviewChanges,1);
  assert.equal(r.changes[0].classification,'review');
});

test('incomplete browser traversal cannot certify an improvement',()=>{
  const candidate=page(375,[],{summary:{verified:false},coverage:{truncated:true}});
  const r=compare(broken(),candidate);
  assert.equal(r.summary.unverifiedViewports,1);
  assert.equal(r.changes.length,0);
  assert.match(r.unverified[0].reasons.join(' '),/traversal/);
});

test('omitted/missing/ambiguous element paths are unverified, not resolved bugs',()=>{
  const baseline=broken();
  const missing=page(375,[finding('broken-image')]);
  assert.equal(compare(missing,healthy()).summary.unverifiedViewports,1);
  const duplicate=page(375,[finding('broken-image','#same'),finding('broken-image','#same')]);
  assert.match(compare(duplicate,healthy()).unverified[0].reasons.join(' '),/duplicate/);
  const truncated=page(375,[],{coverage:{omittedBrokenImages:8}});
  assert.equal(compare(baseline,truncated).summary.unverifiedViewports,1);
  const root=page(375,[finding('document-horizontal-overflow')]);
  assert.match(compare(root,healthy()).unverified[0].reasons.join(' '),/measured pixel/);
});

test('unknown automatic detector semantics fail closed until explicitly supported',()=>{
  const candidate=page(375,[{code:'new-unreviewed-detector',classification:'measured',severity:'error',message:'New detector'}]);
  assert.equal(compare(healthy(),candidate).summary.unverifiedViewports,1);
});

test('different viewport sets cannot produce a misleading regression',()=>{
  assert.throws(()=>comparePageAudits('before','after',[page(320)],[page(375)]),/identical unique viewport widths/);
  assert.throws(()=>comparePageAudits('before','after',[page(375),page(375)],[page(375)]),/identical unique viewport widths/);
  assert.throws(()=>comparePageAudits('before','after',[page(375)],[page(375)],-1),/nonnegative/);
});
