import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePageAudit, summarizeOptionalReviewCoverage } from '../dist/audit.js';

function obs() {
  return {
    visitedElements: 20, traversalLimit: 18000, truncated: false,
    visibleElements: 16, totalImages: 2, unloadedImages: 0,
    brokenImageCount: 0, brokenImages: [], omittedBrokenImages: 0,
    textClipCount: 0, textClips: [], omittedTextClips: 0,
    intentionalEllipses: 1, visuallyHiddenTextExcluded: 0, embeddedFrames: 0
  };
}
function snap(width = 375, docWidth = 375) {
  return {
    viewport: { width, height: 700, contentWidth: width, direction: 'ltr' },
    document: { width: docWidth, height: 1200 },
    selectors: {}
  };
}
test('no-contract audit emits clean coverage for a measured healthy page', () => {
  const report = analyzePageAudit(snap(), obs());
  assert.equal(report.summary.errors, 0);
  assert.equal(report.summary.warnings, 0);
  assert.equal(report.summary.verified, true);
  assert.equal(report.findings.length, 0);
});
test('document overflow is measured relative to usable scrollport, not nominal width', () => {
  const snapshot = snap(375, 401);
  snapshot.viewport.contentWidth = 360;
  snapshot.overflowCandidates = [{path:'#wide',rightOverflow:41,leftOverflow:0,
    position:'static',overflowX:'visible',rect:{x:0,y:10,width:401,height:60}}];
  const report = analyzePageAudit(snapshot, obs());
  assert.equal(report.summary.errors, 1);
  assert.equal(report.findings[0].measuredPx, 41);
  assert.equal(report.findings[0].classification, 'measured');
  assert.equal(report.findings[0].overflowCandidates[0].path, '#wide');
});
test('review-only text clipping and pending loading never become certain layout failures', () => {
  const observations = obs();
  observations.textClipCount = 1;
  observations.textClips = [{
    path:'#text',overflowPx:22,clientWidth:150,scrollWidth:172,overflowStyle:'hidden'
  }];
  observations.unloadedImages = 2;
  const report = analyzePageAudit(snap(), observations);
  assert.equal(report.summary.errors, 0);
  assert.equal(report.summary.warnings, 2);
  assert.ok(report.findings.every(f => f.classification === 'review'));
});
test('broken resource reports remain capped and do not expose arbitrary URL credentials', () => {
  const observations = obs();
  observations.brokenImageCount = 30;
  observations.brokenImages = Array.from({length:16},(_,i)=>({
    path:'#image'+i,source:'https://example.test/image.svg',width:100,height:90
  }));
  observations.omittedBrokenImages = 14;
  const report = analyzePageAudit(snap(), observations);
  assert.equal(report.summary.errors, 17);
  assert.equal(report.findings.at(-1).count, 14);
});
test('capped traversal is explicitly unverified, not an all-clear', () => {
  const evidence = { ...obs(), truncated:true, visitedElements:18000 };
  const report = analyzePageAudit(snap(), evidence);
  assert.equal(report.summary.verified, false);
});

test('embedded frames explicitly disclose unknown inner layout without claiming a verified defect', () => {
  const evidence={...obs(),embeddedFrames:2};
  const report=analyzePageAudit(snap(),evidence);
  assert.equal(report.summary.errors,0);
  assert.equal(report.summary.warnings,1);
  assert.equal(report.findings[0].code,'embedded-frame-uninspected');
  assert.equal(report.findings[0].count,2);
});

test('audit discloses partial scope when frames are present even if top-document traversal completed', () => {
  const snap = {
    viewport: {width:375,height:900,direction:'ltr'},document:{width:375,height:900},selectors:{}
  };
  const observations={visitedElements:3,traversalLimit:18000,truncated:false,visibleElements:3,
    totalImages:0,unloadedImages:0,brokenImageCount:0,brokenImages:[],omittedBrokenImages:0,
    textClipCount:0,textClips:[],omittedTextClips:0,intentionalEllipses:0,
    visuallyHiddenTextExcluded:0,embeddedFrames:1};
  const report=analyzePageAudit(snap, observations);
  assert.equal(report.summary.verified,false, 'known uninspected frames cannot be verified');
  assert.equal(report.summary.supportedScopeMeasured,true, 'the top-document traversal still succeeded');
  assert.equal(report.summary.coverageStatus,'known-uninspected-content');
  assert.equal(report.coverage.status,'known-uninspected-content');
  assert.equal(report.coverage.scope,'top-document-and-open-shadow-roots');
  assert.ok(report.coverage.limitations.some(line=>line.includes('Closed shadow')));
  observations.embeddedFrames=0;
  const complete=analyzePageAudit(snap,observations);
  assert.equal(complete.summary.coverageStatus,'supported-scope-measured');
  assert.equal(complete.summary.verified,true);
  assert.equal(complete.summary.supportedScopeMeasured,true);
  observations.truncated=true;
  const truncated=analyzePageAudit(snap,observations);
  assert.equal(truncated.summary.coverageStatus,'truncated');
  assert.equal(truncated.summary.verified,false);
  assert.equal(truncated.summary.supportedScopeMeasured,false);
});

test('an irregular CSS-grid spacing lead remains nonblocking review evidence',()=>{
 const observations=obs();
 observations.gridGapCount=1;
 observations.gridGapLeads=[{path:'#gallery',expectedGapPx:16,observedGapsPx:[16,28],
   maxDeviationPx:12,itemCount:3}];
 observations.gridContainersInspected=1;observations.gridContainersOmitted=0;
 const report=analyzePageAudit(snap(),observations);
 assert.equal(report.summary.errors,0);
 assert.equal(report.summary.warnings,1);
 assert.equal(report.summary.verified,true);
 assert.equal(report.findings[0].code,'possible-grid-gap-anomaly');
 assert.equal(report.findings[0].classification,'review');
 assert.equal(report.findings[0].measuredPx,12);
});

test('opt-in sibling box overlap is a nonblocking review lead with bounded element references',()=>{
 const observations=obs();
 observations.siblingOverlapCount=1;
 observations.siblingOverlapLeads=[{path:'#gallery',
  children:['#gallery > .card:nth-child(1)','#gallery > .card:nth-child(2)'],
  overlapWidthPx:29,overlapHeightPx:70,overlapAreaPx:2030,
  overlapFraction:.29,overlapExtentPx:29}];
 observations.overlapContainersInspected=1;
 observations.overlapContainersOmitted=0;
 const result=analyzePageAudit(snap(),observations);
 assert.equal(result.summary.errors,0);
 assert.equal(result.summary.warnings,1);
 assert.equal(result.summary.verified,true);
 assert.equal(result.findings[0].code,'possible-sibling-overlap');
 assert.equal(result.findings[0].classification,'review');
 assert.equal(result.findings[0].measuredPx,29);
 assert.deepEqual(result.findings[0].relatedPaths,observations.siblingOverlapLeads[0].children);
 assert.match(result.findings[0].message,/does not prove painted occlusion/i);
});

test('bounded overlap leads disclose omitted groups without inventing reported element paths',()=>{
 const evidence=obs();
 evidence.siblingOverlapCount=30;
 evidence.siblingOverlapLeads=[{path:'#first',children:['#a','#b'],
  overlapWidthPx:25,overlapHeightPx:40,overlapAreaPx:1000,
  overlapFraction:.25,overlapExtentPx:25}];
 evidence.overlapContainersOmitted=2;
 const report=analyzePageAudit(snap(),evidence);
 assert.equal(report.summary.errors,0);
 assert.equal(report.summary.warnings,2);
 assert.equal(report.findings[1].code,'possible-sibling-overlap');
 assert.equal(report.findings[1].count,29);
 assert.equal(report.findings[1].path,undefined);
 assert.ok(report.coverage.limitations.some(s=>/overlap.*omitted/i.test(s)));
});


test('opt-in review candidate omissions are distinct from complete top-level DOM traversal',()=>{
 const report=analyzePageAudit(snap(),obs());
 // A real-site audit can traverse the full top-level DOM but skip dense
 // grid/flex candidates, producing zero review warnings without clean verdict.
 report.coverage.gridContainersOmitted=1;
 report.coverage.gridGapCount=0;
 report.coverage.gridGapLeads=[];
 report.coverage.overlapContainersOmitted=1;
 report.coverage.siblingOverlapCount=0;
 report.coverage.siblingOverlapLeads=[];
 assert.equal(report.summary.verified,true);
 assert.equal(report.summary.warnings,0);
 const summary=summarizeOptionalReviewCoverage([report,structuredClone(report)],{
  gridGapReview:true,siblingOverlapReview:true
 });
 assert.equal(summary.status,'known-omissions');
 assert.equal(summary.viewportsWithOmissions,2);
 assert.equal(summary.viewportsWithUnavailableEvidence,0);
 assert.equal(summary.omittedGridContainers,2);
 assert.equal(summary.omittedOverlapContainers,2);
 assert.equal(summary.totalOmissions,4);
});

test('missing experimental reviewer evidence fails closed instead of claiming no omissions',()=>{
 const report=analyzePageAudit(snap(),obs());
 const summary=summarizeOptionalReviewCoverage([report],{
  gridGapReview:true,siblingOverlapReview:true
 });
 assert.equal(summary.status,'unavailable');
 assert.equal(summary.viewportsWithUnavailableEvidence,1);
 assert.equal(summary.totalOmissions,0);
});

test('bounded review lead omissions are counted separately from omitted containers',()=>{
 const report=analyzePageAudit(snap(),obs());
 report.coverage.gridGapCount=3;
 report.coverage.gridGapLeads=[{path:'#grid',expectedGapPx:8,observedGapsPx:[8,14],maxDeviationPx:6,itemCount:3}];
 report.coverage.gridContainersOmitted=0;
 report.coverage.siblingOverlapCount=2;
 report.coverage.siblingOverlapLeads=[{path:'#overlap',children:['#a','#b'],overlapWidthPx:9,overlapHeightPx:9,overlapAreaPx:81,overlapFraction:0.4,overlapExtentPx:9}];
 report.coverage.overlapContainersOmitted=0;
 const result=summarizeOptionalReviewCoverage([report],{
  gridGapReview:true,siblingOverlapReview:true
 });
 assert.equal(result.status,'known-omissions');
 assert.deepEqual([result.omittedGridLeads,result.omittedOverlapLeads],[2,1]);
 assert.equal(result.totalOmissions,3);
});


test('compact review evidence uses attributed findings when raw lead arrays are intentionally omitted',()=>{
 const page=analyzePageAudit(snap(),obs());
 page.coverage.gridContainersOmitted=1;
 page.coverage.gridGapCount=1;
 page.coverage.overlapContainersOmitted=1;
 page.coverage.siblingOverlapCount=1;
 page.findings=[
  {code:'possible-grid-gap-anomaly',path:'#grid',classification:'review',severity:'warning',message:'measured lead'},
  {code:'possible-sibling-overlap',path:'#flex',classification:'review',severity:'warning',message:'measured lead'}
 ];
 const result=summarizeOptionalReviewCoverage([page],{
  gridGapReview:true,siblingOverlapReview:true
 });
 assert.equal(result.status,'known-omissions');
 assert.equal(result.viewportsWithUnavailableEvidence,0);
 assert.equal(result.omittedGridContainers,1);
 assert.equal(result.omittedOverlapContainers,1);
 assert.equal(result.omittedGridLeads,0);
 assert.equal(result.omittedOverlapLeads,0);
});


test('DOM traversal truncation also makes bounded optional review coverage unavailable',()=>{
 const report=analyzePageAudit(snap(),{...obs(),truncated:true,visitedElements:18000});
 report.coverage.gridContainersOmitted=0;
 report.coverage.gridGapCount=0;
 report.coverage.gridGapLeads=[];
 const summary=summarizeOptionalReviewCoverage([report],{
  gridGapReview:true,siblingOverlapReview:false
 });
 assert.equal(summary.status,'unavailable');
 assert.equal(summary.viewportsWithUnavailableEvidence,1);
 assert.equal(summary.totalOmissions,0);
});
