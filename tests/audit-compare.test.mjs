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


test('a uniquely identified broken image moving to another DOM path is not a new regression',()=>{
  const src='https://static.example.test/media/missing-photo.jpg';
  const before=page(375,[{...finding('broken-image','main>img:nth-of-type(1)'),source:src}],
    {summary:{verified:true,supportedScopeMeasured:true}});
  const after=page(375,[{...finding('broken-image','main>img:nth-of-type(2)'),source:src}],
    {summary:{verified:true,supportedScopeMeasured:true}});
  const r=compare(before,after);
  assert.equal(r.summary.measuredRegressions,0);
  assert.equal(r.summary.measuredImprovements,0);
  assert.equal(r.summary.unverifiedViewports,0);
  assert.deepEqual(r.changes,[]);
});

test('a uniquely named broken resource may be matched across different baseline/candidate hosts',()=>{
  const before=page(375,[{...finding('broken-image','#gallery>img:nth-of-type(1)'),
    source:'http://127.0.0.1:32001/media/missing-photo.png'}]);
  const after=page(375,[{...finding('broken-image','#gallery>img:nth-of-type(2)'),
    source:'http://127.0.0.1:32002/media/missing-photo.png'}]);
  const r=compare(before,after);
  assert.equal(r.summary.measuredRegressions,0);
  assert.equal(r.summary.measuredImprovements,0);
  assert.equal(r.summary.unverifiedViewports,0);
});

test('ambiguous moved DOM paths are unverified, not a fake new failure and fix',()=>{
  const before=page(375,[finding('broken-image','main>img:nth-of-type(1)')]);
  const after=page(375,[finding('broken-image','main>img:nth-of-type(2)')]);
  const r=compare(before,after);
  assert.equal(r.summary.measuredRegressions,0);
  assert.equal(r.summary.measuredImprovements,0);
  assert.equal(r.summary.unverifiedViewports,1);
  assert.match(r.unverified[0].reasons.join(' '),/Cannot identify/);
});

test('a net increase in failed images remains measurable without inventing an element identity',()=>{
  const before=page(375,[finding('broken-image','#old')]);
  const after=page(375,[finding('broken-image','#new'),finding('broken-image','#another')]);
  const r=compare(before,after);
  assert.equal(r.summary.measuredRegressions,1);
  assert.equal(r.summary.measuredImprovements,0);
  assert.equal(r.changes[0].path,undefined);
  assert.deepEqual([r.changes[0].baselineValue,r.changes[0].candidateValue],[1,2]);
  assert.match(r.changes[0].message,/no exact element is attributed/);
});

test('duplicate resource URLs are not used to invent stable identities after DOM reordering',()=>{
  const same='https://static.example.test/image/missing.png';
  const before=page(375,[
    {...finding('broken-image','#a'),source:same},
    {...finding('broken-image','#b'),source:same}
  ]);
  const after=page(375,[
    {...finding('broken-image','#x'),source:same},
    {...finding('broken-image','#y'),source:same}
  ]);
  const r=compare(before,after);
  assert.equal(r.summary.measuredRegressions,0);
  assert.equal(r.summary.measuredImprovements,0);
  assert.equal(r.summary.unverifiedViewports,1);
});

test('unsupported page interiors remain explicitly partial without claiming scope traversal failed',()=>{
  const baseline=page(375,[],{summary:{verified:true,supportedScopeMeasured:true}});
  const candidate=page(375,[finding('embedded-frame-uninspected')],{
    summary:{verified:false,supportedScopeMeasured:true},
    coverage:{embeddedFrames:1,status:'known-uninspected-content'}
  });
  const r=compare(baseline,candidate);
  assert.equal(r.summary.unverifiedViewports,0);
  assert.equal(r.summary.reviewChanges,1);
  assert.equal(r.summary.measuredRegressions,0);
});

test('partially omitted opt-in grid candidate sampling cannot certify an automatic comparison',()=>{
 const baseline=page(375,[],{coverage:{gridContainersInspected:1,gridContainersOmitted:0}});
 const candidate=page(375,[],{coverage:{gridContainersInspected:120,gridContainersOmitted:1}});
 const result=compare(baseline,candidate);
 assert.equal(result.summary.unverifiedViewports,1);
 assert.match(result.unverified[0].reasons.join(' '),/grid-gap review omitted candidate/);
});

test('the same grid spacing lead becoming materially worse is a review change, never a regression',()=>{
 const baseline=page(375,[finding('possible-grid-gap-anomaly','#gallery',12)]);
 const candidate=page(375,[finding('possible-grid-gap-anomaly','#gallery',24)]);
 const result=compare(baseline,candidate);
 assert.equal(result.summary.measuredRegressions,0);
 assert.equal(result.summary.measuredImprovements,0);
 assert.equal(result.summary.reviewChanges,1);
 assert.equal(result.summary.unverifiedViewports,0);
 assert.equal(result.changes.length,1);
 assert.deepEqual({kind:result.changes[0].kind,path:result.changes[0].path,
  baselineValue:result.changes[0].baselineValue,candidateValue:result.changes[0].candidateValue},
  {kind:'review-worsened',path:'#gallery',baselineValue:12,candidateValue:24});
 assert.match(result.changes[0].message,/increased by 12\.00 CSS px/);
});

test('persisting text clipping with a larger/smaller magnitude generates review-only changes',()=>{
 const wide=page(375,[finding('possible-text-clipping','#title',16)]);
 const narrow=page(375,[finding('possible-text-clipping','#title',46)]);
 const worsened=compare(wide,narrow);
 assert.equal(worsened.summary.reviewChanges,1);
 assert.equal(worsened.summary.measuredRegressions,0);
 assert.equal(worsened.changes[0].kind,'review-worsened');
 assert.equal(worsened.changes[0].baselineValue,16);
 assert.equal(worsened.changes[0].candidateValue,46);
 const improved=compare(narrow,wide);
 assert.equal(improved.summary.reviewChanges,1);
 assert.equal(improved.summary.measuredImprovements,0);
 assert.equal(improved.changes[0].kind,'review-improved');
 assert.deepEqual([improved.changes[0].baselineValue,improved.changes[0].candidateValue],[46,16]);
});

test('persistent warnings ignore sub-two-pixel jitter and caller significance floors',()=>{
 const before=page(375,[finding('possible-grid-gap-anomaly','#same-grid',12)]);
 for(const afterValue of [12,12.5,13.99,14]){
  const after=page(375,[finding('possible-grid-gap-anomaly','#same-grid',afterValue)]);
  assert.equal(compare(before,after).summary.reviewChanges,0,'noise '+afterValue);
 }
 const materiallyChanged=page(375,[finding('possible-grid-gap-anomaly','#same-grid',15)]);
 assert.equal(compare(before,materiallyChanged).changes[0].kind,'review-worsened');
 assert.equal(comparePageAudits('base','candidate',[before],[materiallyChanged],5).summary.reviewChanges,0);
});

test('missing numeric evidence on a persistent warning is unverified rather than claiming no change',()=>{
 const baseline=page(375,[finding('possible-grid-gap-anomaly','#same-grid',12)]);
 const candidate=page(375,[finding('possible-grid-gap-anomaly','#same-grid')]);
 const result=compare(baseline,candidate);
 assert.equal(result.summary.reviewChanges,0);
 assert.equal(result.summary.unverifiedViewports,1);
 assert.match(result.unverified[0].reasons.join(' '),/numeric deviation/);
});

test('review magnitude change and new measured broken-image regression remain independent',()=>{
 const old=page(375,[finding('possible-text-clipping','#label',30)]);
 const next=page(375,[finding('possible-text-clipping','#label',44),finding('broken-image','#broken')]);
 const result=compare(old,next);
 assert.equal(result.summary.reviewChanges,1);
 assert.equal(result.summary.measuredRegressions,1);
 assert.equal(result.changes.find(item=>item.code==='possible-text-clipping').kind,'review-worsened');
 assert.equal(result.changes.find(item=>item.code==='broken-image').kind,'regression');
});

test('new warning at another path is not treated as a persistent magnitude change',()=>{
 const old=page(375,[finding('possible-text-clipping','#first',14)]);
 const next=page(375,[finding('possible-text-clipping','#next',40)]);
 const result=compare(old,next);
 assert.equal(result.summary.reviewChanges,0);
 assert.equal(result.summary.unverifiedViewports,1);
 assert.match(result.unverified[0].reasons.join(' '),/Cannot identify/);
});
