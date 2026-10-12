import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { validateFieldManifest, validateFieldLabels, scoreFieldEvidence } from '../scripts/field-benchmark-core.mjs';
const root = path.resolve(import.meta.dirname, '..');
const runner = path.join(root, 'scripts/field-benchmark.mjs');
const protocol = 'Review actual rendered page and screenshot before viewing any automatic detector findings.';
const reviewed = id => ({ id, reviewStatus: 'reviewed', reviewer: 'Test Reviewer',
  reviewedAt: '2026-10-12', rationale: 'Fixtures simulate an independently inspected page, not a real benchmark result.',
  reviewedScreenshot: true, reviewedRenderedPage: true,
  expectedMeasured: ['broken-image'], expectedReview: [] });
test('field manifests refuse unapproved hosts and fixture use without opt-in', () => {
  const basic = { schemaVersion: 1, id: 'field-check', allowedHosts: ['example.com'],
    cases: [{ id: 'page-375', url: 'https://example.com/', width: 375 }] };
  assert.equal(validateFieldManifest(basic).cases.length, 1);
  assert.throws(() => validateFieldManifest({ ...basic, cases: [
    { id: 'other', url: 'https://unapproved.example/', width: 375 }] }), /allowlisted/);
  assert.throws(() => validateFieldManifest({ ...basic, cases: [
    { id: 'fixture', url: 'examples/audit-healthy.html', width: 375 }] }), /--fixtures/);
  assert.equal(validateFieldManifest({ ...basic, cases: [
    { id: 'fixture', url: 'examples/audit-healthy.html', width: 375 }] }, true).cases.length, 1);
});
test('unreviewed cases never turn into true negatives', () => {
  const cases = [
    { id: 'reviewed', width: 375, complete: true, screenshotVerified: true },
    { id: 'pending', width: 768, complete: true, screenshotVerified: true }
  ];
  const labels = { schemaVersion: 1, datasetId: 'field-review', reviewProtocol: protocol,
    cases: [reviewed('reviewed')] };
  const observed = { reviewed: { mode: 'audit', summary: { viewports: 1 }, reports: [{
    width: 375, summary: { verified: true }, coverage: { truncated: false },
    findings: [{ code: 'broken-image', classification: 'measured' },
      { code: 'possible-text-clipping', classification: 'review' }]
  }] } };
  const result = scoreFieldEvidence({ schemaVersion: 1, datasetId: 'field-review', cases }, labels, observed);
  assert.deepEqual(result.pending, ['pending']);
  assert.equal(result.metrics.evaluatedCases, 1);
  assert.equal(result.metrics.measured.tp, 1);
  assert.equal(result.metrics.review.fp, 1);
  assert.equal(result.metrics.review.precision, 0);
  const incomplete = scoreFieldEvidence({ schemaVersion: 1, datasetId: 'field-review',
    cases: cases.map(c => ({ ...c, screenshotVerified: false })) }, labels, observed);
  assert.equal(incomplete.metrics.incompleteCases, 1);
  assert.equal(incomplete.metrics.evaluatedCases, 0);
  assert.throws(() => validateFieldLabels({ ...labels, cases: [
    { ...reviewed('reviewed'), reviewedScreenshot: false }] }, 'field-review',
  cases.map(c => c.id)), /attest/);
});
test('fixture-only field capture hashes screenshot/report and refuses tampered review evidence', t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bronto-field-test-'));
  const exec = args => spawnSync(process.execPath, [runner, ...args], {
    cwd: root, encoding: 'utf8', timeout: 90000,
    env: { ...process.env, BRONTO_CHROME_NO_SANDBOX: '1', BRONTO_TEST_INLINE_FIXTURE: '1' }
  });
  try {
    const manifest = path.join(dir, 'manifest.json');
    const output = path.join(dir, 'capture');
    const labelsFile = path.join(dir, 'labels.json');
    writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, id: 'fixture-plumbing',
      allowedHosts: [], cases: [{ id: 'fixture-375', url: 'examples/audit-healthy.html', width: 375 }] }));
    const capture = exec(['capture', '--fixtures', '--manifest', manifest, '--out', output]);
    if (/Cannot find Chrome\/Chromium/.test(capture.stdout + capture.stderr)) {
      if (process.env.BRONTO_REQUIRE_CHROME === '1') throw new Error('Chromium required');
      t.skip('Chromium unavailable'); return;
    }
    assert.equal(capture.status, 0, capture.stderr || capture.stdout);
    const index = JSON.parse(readFileSync(path.join(output, 'index.json'), 'utf8'));
    assert.equal(index.cases[0].complete, true);
    assert.equal(index.cases[0].screenshotSha256.length, 64);
    const label = { ...reviewed('fixture-375'), expectedMeasured: [] };
    writeFileSync(labelsFile, JSON.stringify({ schemaVersion: 1, datasetId: index.datasetId,
      reviewProtocol: protocol, cases: [label] }));
    assert.equal(exec(['score', '--captures', output, '--labels', labelsFile, '--assert']).status, 0);
    const screenshot = path.join(output, index.cases[0].screenshotFile);
    writeFileSync(screenshot, Buffer.concat([readFileSync(screenshot), Buffer.from('altered')]));
    const score = exec(['score', '--captures', output, '--labels', labelsFile, '--assert', '--json']);
    assert.equal(score.status, 2, score.stderr || score.stdout);
    assert.equal(JSON.parse(score.stdout).metrics.incompleteCases, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('reviewed iframe pages never contribute fabricated field true negatives or missed positives',()=>{
 const cases=[
   {id:'clean',width:375,complete:true,screenshotVerified:true},
   {id:'partial',width:375,complete:true,screenshotVerified:true}
 ];
 const labels={schemaVersion:1,datasetId:'frame-scoring',reviewProtocol:protocol,cases:[
   {...reviewed('clean'),expectedMeasured:[],expectedReview:[]},
   {...reviewed('partial'),expectedMeasured:['broken-image'],expectedReview:['embedded-frame-uninspected']}
 ]};
 const base={mode:'audit',summary:{viewports:1},reports:[{
   width:375,summary:{verified:true},coverage:{truncated:false,embeddedFrames:0,status:'supported-scope-measured'},findings:[]
 }]};
 const partial=structuredClone(base);
 partial.reports[0].coverage={truncated:false,embeddedFrames:1,status:'known-uninspected-content'};
 partial.reports[0].findings=[{classification:'review',code:'embedded-frame-uninspected'}];
 const result=scoreFieldEvidence({schemaVersion:1,datasetId:'frame-scoring',cases},labels,{clean:base,partial});
 assert.equal(result.metrics.evaluatedCases,1);
 assert.equal(result.metrics.incompleteCases,1);
 assert.deepEqual(result.coverageExcluded,[{id:'partial',reason:'Embedded-frame content was not audited'}]);
 assert.equal(result.metrics.measured.fn,0);
 assert.equal(result.metrics.perCode.measured['broken-image'].recall,null);
 assert.equal(result.metrics.review.tp,0);
 // The historic v0.4 captures predate the explicit coverage.status: the
 // embedded-frame count still prevents scoring their uninspected internals.
 delete partial.reports[0].coverage.status;
 const historical=scoreFieldEvidence({schemaVersion:1,datasetId:'frame-scoring',cases},labels,{clean:base,partial});
 assert.equal(historical.metrics.incompleteCases,1);
 partial.reports[0].coverage.status='future-unsupported-frame-scope';
 partial.reports[0].coverage.embeddedFrames=0;
 const future=scoreFieldEvidence({schemaVersion:1,datasetId:'frame-scoring',cases},labels,{clean:base,partial});
 assert.equal(future.metrics.incompleteCases,1);
 assert.equal(future.coverageExcluded[0].reason,'Incomplete or unsupported audit coverage: future-unsupported-frame-scope');
});

test('allowlisted fixture capture preserves DOMSnapshot frame evidence but flags content as partial',t=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'bronto-field-frame-'));
 try {
  const manifest=path.join(dir,'manifest.json');
  const output=path.join(dir,'capture');
  writeFileSync(manifest,JSON.stringify({schemaVersion:1,id:'frame-fixture-field',allowedHosts:[],
    cases:[{id:'frame-375',url:'examples/audit-iframe-coverage.html',width:375}]}));
  const capture=spawnSync(process.execPath,[runner,'capture','--fixtures','--manifest',manifest,
    '--out',output,'--frame-inventory'],{cwd:root,encoding:'utf8',timeout:75000,
    env:{...process.env,BRONTO_CHROME_NO_SANDBOX:'1',BRONTO_TEST_INLINE_FIXTURE:'1'}});
  if(/Cannot find Chrome\/Chromium/.test(capture.stdout+capture.stderr)){
    if(process.env.BRONTO_REQUIRE_CHROME==='1') throw new Error('CI requires Chromium');
    t.skip('Chromium unavailable');return;
  }
  assert.equal(capture.status,0,capture.stderr||capture.stdout);
  const index=JSON.parse(readFileSync(path.join(output,'index.json'),'utf8'));
  assert.equal(index.captureOptions.frameInventory,true);
  assert.equal(index.cases[0].complete,true,'A frame gap does not mean capture integrity failed');
  assert.equal(index.cases[0].contentCoverage,'known-uninspected-content');
  const report=JSON.parse(readFileSync(path.join(output,index.cases[0].auditFile),'utf8'));
  assert.equal(report.reports[0].frameInventory.observedFrameDocuments,1);
  assert.ok(report.reports[0].findings.some(f=>f.code==='embedded-frame-uninspected'));
 } finally {rmSync(dir,{recursive:true,force:true});}
});

test('bounded below-fold field capture preserves image hashes and excludes tampered reviewer evidence',t=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'bronto-field-below-fold-'));
 const exec=args=>spawnSync(process.execPath,[runner,...args],{
  cwd:root,encoding:'utf8',timeout:90000,
  env:{...process.env,BRONTO_CHROME_NO_SANDBOX:'1',BRONTO_TEST_INLINE_FIXTURE:'1'}
 });
 try{
  const manifest=path.join(dir,'manifest.json');
  const captureDir=path.join(dir,'capture');
  const labelsFile=path.join(dir,'labels.json');
  const worksheet=path.join(dir,'review.md');
  writeFileSync(manifest,JSON.stringify({schemaVersion:1,id:'below-fold-fixture',allowedHosts:[],
   cases:[{id:'long-375',url:'examples/audit-long-page.html',width:375}]}));
  const run=exec(['capture','--fixtures','--manifest',manifest,'--out',captureDir,'--full-page-evidence']);
  if(/Cannot find Chrome\/Chromium/.test(run.stdout+run.stderr)){
   if(process.env.BRONTO_REQUIRE_CHROME==='1')throw new Error('Chromium required in CI');
   t.skip('Chromium unavailable');return;
  }
  assert.equal(run.status,0,run.stderr||run.stdout);
  const index=JSON.parse(readFileSync(path.join(captureDir,'index.json'),'utf8'));
  const entry=index.cases[0];
  assert.equal(index.captureOptions.fullPageEvidence,true);
  assert.equal(entry.complete,true);
  assert.equal(entry.fullPageEvidenceCoverage,'rendered-document-rectangle');
  assert.equal(entry.fullPageTruncated,false);
  assert.ok(entry.fullPageCapturedHeight>=2820);
  assert.equal(entry.fullPageScreenshotSha256.length,64);
  const packet=exec(['review-packet','--captures',captureDir,'--out',worksheet,'--json']);
  assert.equal(packet.status,0,packet.stderr||packet.stdout);
  assert.equal(JSON.parse(packet.stdout).readyForReview,1);
  const text=readFileSync(worksheet,'utf8');
  assert.match(text,/Bounded below-fold image/);
  assert.match(text,/Bounded image hash: verified/);
  assert.doesNotMatch(text,/broken-image|possible-text-clipping/);
  const label={...reviewed('long-375'),expectedMeasured:[],expectedReview:[]};
  writeFileSync(labelsFile,JSON.stringify({schemaVersion:1,datasetId:index.datasetId,
   reviewProtocol:protocol,cases:[label]}));
  const clean=exec(['score','--captures',captureDir,'--labels',labelsFile,'--json','--assert']);
  assert.equal(clean.status,0,clean.stderr||clean.stdout);
  assert.equal(JSON.parse(clean.stdout).metrics.evaluatedCases,1);
  const screenshot=path.join(captureDir,entry.fullPageScreenshotFile);
  writeFileSync(screenshot,Buffer.concat([readFileSync(screenshot),Buffer.from('altered')]));
  const bad=exec(['score','--captures',captureDir,'--labels',labelsFile,'--json','--assert']);
  assert.equal(bad.status,2,bad.stderr||bad.stdout);
  const result=JSON.parse(bad.stdout);
  assert.equal(result.metrics.evaluatedCases,0);
  assert.equal(result.metrics.incompleteCases,1);
  const badPacket=exec(['review-packet','--captures',captureDir,'--out',path.join(dir,'bad-review.md'),'--json']);
  assert.equal(badPacket.status,0,badPacket.stderr||badPacket.stdout);
  assert.equal(JSON.parse(badPacket.stdout).readyForReview,0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('unfinished human label drafts remain pending rather than falsely clean',()=>{
 const dataset='review-pending-proof';
 const cases=[
  {id:'case-reviewed',width:375,complete:true,screenshotVerified:true},
  {id:'case-pending',width:375,complete:true,screenshotVerified:true}
 ];
 const labels={schemaVersion:1,datasetId:dataset,reviewProtocol:protocol,cases:[
  {...reviewed('case-reviewed'),expectedMeasured:[],expectedReview:[]},
  {id:'case-pending',reviewStatus:'pending'}
 ]};
 assert.doesNotThrow(()=>validateFieldLabels(labels,dataset,cases.map(c=>c.id)));
 const report={mode:'audit',summary:{viewports:1},reports:[{width:375,
  summary:{verified:true},coverage:{truncated:false,embeddedFrames:0,status:'supported-scope-measured'},
  findings:[]}]};
 const score=scoreFieldEvidence({schemaVersion:1,datasetId:dataset,cases},labels,{
  'case-reviewed':report,'case-pending':report});
 assert.deepEqual(score.pending,['case-pending']);
 assert.equal(score.metrics.evaluatedCases,1);
 assert.equal(score.metrics.measured.tp,0);
 assert.equal(score.metrics.measured.precision,null);
 assert.equal(score.metrics.measured.recall,null);
 assert.throws(()=>validateFieldLabels({...labels,cases:[
  {id:'case-pending',reviewStatus:'pending',expectedMeasured:[]}
 ]},dataset,cases.map(c=>c.id)),/pending case cannot contain/);
});
