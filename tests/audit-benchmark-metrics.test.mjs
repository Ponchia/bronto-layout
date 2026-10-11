import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBenchmarkManifest,scoreLabeledAuditCases,KNOWN_DETECTORS } from '../scripts/audit-benchmark-metrics.mjs';
import fs from 'node:fs';
const source=JSON.parse(fs.readFileSync(new URL('../benchmarks/audit-controlled-v0.1.json',import.meta.url)));

test('controlled benchmark manifest contains authored, bounded, distinct labeled cases',()=>{
  const manifest=validateBenchmarkManifest(source);
  assert.equal(manifest.cases.length,13);
  assert.equal(new Set(manifest.cases.map(c=>c.id)).size,13);
  assert.ok(manifest.cases.every(c=>c.labelReason.length>18));
  assert.ok(manifest.cases.some(c=>c.expectedMeasured.includes('broken-image')));
  assert.ok(manifest.cases.some(c=>c.expectedReview.includes('possible-text-clipping')));
});
test('injected unknown detector classes or duplicate labels cannot change the metric denominator',()=>{
  const bogus=structuredClone(source);
  bogus.cases[0].expectedMeasured=['possible-text-clipping'];
  assert.throws(()=>validateBenchmarkManifest(bogus),/cannot be labeled/);
  bogus.cases[0].expectedMeasured=['broken-image','broken-image'];
  assert.throws(()=>validateBenchmarkManifest(bogus),/duplicates/);
  bogus.cases[0].expectedMeasured=[];
  bogus.cases[1].id=bogus.cases[0].id;
  assert.throws(()=>validateBenchmarkManifest(bogus),/invalid case ID/);
});
test('micro confusion matrices exclude incomplete inspections instead of awarding true negatives',()=>{
  const rows=[
    {id:'true',complete:true,expectedMeasured:['broken-image'],expectedReview:[],
      observedMeasured:['broken-image'],observedReview:[]},
    {id:'false-positive',complete:true,expectedMeasured:[],expectedReview:[],
      observedMeasured:['document-horizontal-overflow'],observedReview:[]},
    {id:'false-negative',complete:true,expectedMeasured:['document-horizontal-overflow'],expectedReview:['possible-text-clipping'],
      observedMeasured:[],observedReview:[]},
    {id:'unmeasured',complete:false,error:'Browser navigation timed out',
      expectedMeasured:[],expectedReview:[],observedMeasured:[],observedReview:[]}
  ];
  const score=scoreLabeledAuditCases(rows);
  assert.equal(score.evaluatedCases,3);
  assert.equal(score.matchingCases,1);
  assert.equal(score.incompleteCases,1);
  assert.deepEqual(
    [score.measured.tp,score.measured.fp,score.measured.fn,score.measured.tn],
    [1,1,1,3]
  );
  assert.equal(score.measured.precision,.5);
  assert.equal(score.measured.recall,.5);
  assert.equal(score.review.fn,1);
  assert.equal(score.caseResults.find(x=>x.id==='unmeasured').status,'incomplete');
});
test('undefined precision or recall remains null when no positive labels or predictions exist',()=>{
  const score=scoreLabeledAuditCases([{
    id:'empty',complete:true,
    expectedMeasured:[],expectedReview:[],observedMeasured:[],observedReview:[]
  }]);
  assert.equal(score.measured.precision,null);
  assert.equal(score.measured.recall,null);
  assert.equal(score.review.precision,null);
  assert.equal(score.review.recall,null);
  assert.equal(score.measured.tn,KNOWN_DETECTORS.measured.length);
  assert.equal(score.review.tn,KNOWN_DETECTORS.review.length);
});
test('different classification is not silently treated as an equivalent issue',()=>{
  const row={id:'different',complete:true,expectedMeasured:['broken-image'],expectedReview:[],
    observedMeasured:[],observedReview:['pending-image']};
  const score=scoreLabeledAuditCases([row]);
  assert.equal(score.measured.fn,1);
  assert.equal(score.review.fp,1);
  assert.equal(score.matchingCases,0);
  assert.equal(score.caseResults[0].mismatches.length,2);
});
