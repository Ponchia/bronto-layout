import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
const cwd=path.resolve(import.meta.dirname,'..');
const script=path.join(cwd,'scripts/field-benchmark.mjs');
const sha=b=>createHash('sha256').update(b).digest('hex');
test('field review worksheet independently verifies evidence and never populates labels',()=>{
 const base=mkdtempSync(path.join(os.tmpdir(),'bronto-field-review-'));
 try {
  const captures=path.join(base,'captures');
  mkdirSync(path.join(captures,'cases','case-320'),{recursive:true});
  const image=Buffer.from([137,80,78,71,13,10,26,10,1,2,3]);
  const report=Buffer.from('{"mode":"audit","findings":["not ground truth"]}');
  writeFileSync(path.join(captures,'cases/case-320/screen.png'),image);
  writeFileSync(path.join(captures,'cases/case-320/audit.json'),report);
  writeFileSync(path.join(captures,'index.json'),JSON.stringify({schemaVersion:1,datasetId:'test-cohort',
    capturedAt:'2026-10-12',sourceCommit:'abcd',cases:[{
      id:'case-320',url:'https://example.org/',width:320,complete:true,
      screenshotFile:'cases/case-320/screen.png',screenshotSha256:sha(image),
      auditFile:'cases/case-320/audit.json',auditSha256:sha(report)
    }]}));
  const output=path.join(base,'worksheet.md');
  const run=()=>spawnSync(process.execPath,[script,'review-packet','--captures',captures,'--out',output,'--json'],{cwd,encoding:'utf8'});
  const result=run();
  assert.equal(result.status,0,result.stderr);
  const json=JSON.parse(result.stdout);
  assert.equal(json.readyForReview,1);
  assert.equal(json.pendingHumanLabels,1);
  const content=readFileSync(output,'utf8');
  assert.match(content,/Record reviewer identity/);
  assert.doesNotMatch(content,/not ground truth/); // tool findings are not copied into human worksheet
  assert.equal(run().status,2); // do not clobber review work
 } finally {rmSync(base,{recursive:true,force:true});}
});

test('field benchmark help shows independent review commands without starting a browser',()=>{
 const result=spawnSync(process.execPath,[script,'--help'],{cwd,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/review-label-template/);
 assert.match(result.stdout,/review-progress/);
 assert.match(result.stdout,/Scores exclude unreviewed/);
});

test('blank field-label template is id-only, preserves all pending cases and never clones detector findings',()=>{
 const base=mkdtempSync(path.join(os.tmpdir(),'bronto-field-human-labels-'));
 try {
  const captures=path.join(base,'captures');
  const cases=['healthy-375','known-iframe-320'];
  for(const id of cases)mkdirSync(path.join(captures,'cases',id),{recursive:true});
  const image=Buffer.from([137,80,78,71,13,10,26,10,0]);
  const automatic=Buffer.from('{"mode":"audit","findings":["DO-NOT-COPY-AUTOMATIC-PREDICTIONS"]}');
  const entry=(id,width,contentCoverage)=>{
    const rel=`cases/${id}`;
    writeFileSync(path.join(captures,rel,'screen.png'),image);
    writeFileSync(path.join(captures,rel,'audit.json'),automatic);
    return {id,width,url:`https://example.test/${id}`,contentCoverage,complete:true,
      screenshotFile:rel+'/screen.png',screenshotSha256:sha(image),
      auditFile:rel+'/audit.json',auditSha256:sha(automatic)};
  };
  writeFileSync(path.join(captures,'index.json'),JSON.stringify({schemaVersion:1,datasetId:'sample-human-review',
    cases:[entry(cases[0],375,'supported-scope-measured'),entry(cases[1],320,'known-uninspected-content')]}));
  const labelsFile=path.join(base,'labels-draft.json');
  const invoke=(...args)=>spawnSync(process.execPath,[script,...args],{cwd,encoding:'utf8'});
  const created=invoke('review-label-template','--captures',captures,'--out',labelsFile,'--json');
  assert.equal(created.status,0,created.stderr);
  const result=JSON.parse(created.stdout);
  assert.deepEqual([result.pending,result.humanLabels,result.readyForHumanReview],[2,0,2]);
  const draft=JSON.parse(readFileSync(labelsFile,'utf8'));
  assert.equal(draft.datasetId,'sample-human-review');
  assert.deepEqual(draft.cases,cases.map(id=>({id,reviewStatus:'pending'})));
  assert.ok(draft.reviewProtocol.includes('BEFORE viewing automated'));
  assert.doesNotMatch(readFileSync(labelsFile,'utf8'),/DO-NOT-COPY-AUTOMATIC|expectedMeasured|expectedReview/);
  const progress=invoke('review-progress','--captures',captures,'--labels',labelsFile,'--json');
  assert.equal(progress.status,0,progress.stderr);
  const status=JSON.parse(progress.stdout);
  assert.deepEqual(status.pending,cases);
  assert.deepEqual(status.reviewed,[]);
  assert.deepEqual(status.unreviewable,[]);
  assert.deepEqual(status.evidenceUnsafe,[]);
  assert.equal(status.detectorPredictionsIncluded,false);
  assert.equal(invoke('review-label-template','--captures',captures,'--out',labelsFile).status,2,
    'must never overwrite edits in a reviewer labels file');
  const forged={...draft,cases:[{id:cases[0],reviewStatus:'pending',expectedMeasured:[]}]};
  writeFileSync(labelsFile,JSON.stringify(forged));
  const invalid=invoke('review-progress','--captures',captures,'--labels',labelsFile);
  assert.equal(invalid.status,2);
  assert.match(invalid.stderr,/pending case cannot contain/);
 }finally {rmSync(base,{recursive:true,force:true});}
});

test('review-progress validates independent label attestations and separately reports missing evidence hashes',()=>{
 const base=mkdtempSync(path.join(os.tmpdir(),'bronto-field-review-state-'));
 try{
  const captures=path.join(base,'captures');
  mkdirSync(path.join(captures,'cases','record-375'),{recursive:true});
  const png=Buffer.from([137,80,78,71,13,10,26,10,4]);
  const audited=Buffer.from('{"mode":"audit","findings":["private detector predictions"]}');
  writeFileSync(path.join(captures,'cases/record-375/screen.png'),png);
  writeFileSync(path.join(captures,'cases/record-375/audit.json'),audited);
  writeFileSync(path.join(captures,'index.json'),JSON.stringify({schemaVersion:1,datasetId:'evidence-hash-review',cases:[{
    id:'record-375',url:'https://example.test/',width:375,complete:true,
    screenshotFile:'cases/record-375/screen.png',screenshotSha256:sha(png),
    auditFile:'cases/record-375/audit.json',auditSha256:sha(audited)
  }]}));
  const labels={schemaVersion:1,datasetId:'evidence-hash-review',
    reviewProtocol:'Independently reviewed actual page and screenshot without access to detector output first.',
    cases:[{id:'record-375',reviewStatus:'reviewed',reviewer:'Synthetic Fixture Reviewer',
      reviewedAt:'2026-10-12',rationale:'This is simulated input for a unit test, not verified real-world ground truth.',
      reviewedScreenshot:true,reviewedRenderedPage:true,expectedMeasured:[],expectedReview:[]}]};
  const filename=path.join(base,'labels.json');writeFileSync(filename,JSON.stringify(labels));
  const cmd=()=>spawnSync(process.execPath,[script,'review-progress','--captures',captures,'--labels',filename,'--json'],{cwd,encoding:'utf8'});
  const good=cmd();assert.equal(good.status,0,good.stderr);
  assert.deepEqual(JSON.parse(good.stdout).reviewed,['record-375']);
  assert.deepEqual(JSON.parse(good.stdout).evidenceUnsafe,[]);
  writeFileSync(path.join(captures,'cases/record-375/screen.png'),Buffer.from('tampered image'));
  const bad=cmd();assert.equal(bad.status,0,bad.stderr);
  assert.deepEqual(JSON.parse(bad.stdout).reviewed,['record-375'],
    'human attestation is distinct from artifact integrity');
  assert.deepEqual(JSON.parse(bad.stdout).evidenceUnsafe,['record-375']);
  assert.equal(JSON.parse(bad.stdout).detectorPredictionsIncluded,false);
 }finally{rmSync(base,{recursive:true,force:true});}
});
