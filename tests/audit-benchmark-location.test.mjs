import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  scoreLabeledAuditCases, scoreLabeledElementLocations,
  validateBenchmarkManifest
} from '../scripts/audit-benchmark-metrics.mjs';

const read = version => JSON.parse(readFileSync(
  new URL('../benchmarks/audit-controlled-' + version + '.json', import.meta.url)
));

const original = read('v0.2');
const localized = read('v0.3');

const row = (id, expectedLocations, observedLocations, overrides={}) => ({
  id, complete:true, localizationComplete:true,
  expectedMeasured:[], expectedReview:[],
  observedMeasured:[], observedReview:[],
  expectedLocations, observedLocations, ...overrides
});
const empty = () => ({
  'broken-image': [],
  'possible-text-clipping': []
});

test('versioned localization ground truth retains all v0.2 classification labels', () => {
  const valid = validateBenchmarkManifest(localized);
  assert.equal(valid.cases.length, 33);
  assert.deepEqual(valid.localization.codes, ['broken-image','possible-text-clipping']);
  assert.deepEqual(valid.cases.slice(0,31).map(({ expectedLocations, ...other }) => other), original.cases);
  assert.equal(valid.cases.filter(c => c.expectedLocations['broken-image'].length).length, 10);
  assert.equal(valid.cases.filter(c => c.expectedLocations['possible-text-clipping'].length).length, 3);
  const duplicate = valid.cases.find(c => c.id === 'open-shadow-duplicate-id-320');
  assert.deepEqual(duplicate.expectedLocations['broken-image'], [
    '#host-a >>> #missing', '#host-b >>> #missing'
  ]);
  assert.notEqual(duplicate.expectedLocations['broken-image'][0],
    duplicate.expectedLocations['broken-image'][1]);
});

test('correct issue category on the WRONG element counts as one FP and one FN', () => {
  const expected = { ...empty(), 'broken-image':['#real-broken-image'] };
  const observed = { ...empty(), 'broken-image':['#different-image'] };
  const result = scoreLabeledElementLocations([row('mislocalized', expected, observed)]);
  assert.equal(result.tp,0);
  assert.equal(result.fp,1);
  assert.equal(result.fn,1);
  assert.equal(result.precision,0);
  assert.equal(result.recall,0);
  assert.equal(result.matchingCases,0);
  assert.equal(result.caseResults[0].mismatches.length,2);
  assert.deepEqual(new Set(result.caseResults[0].mismatches.map(m=>m.type)),
    new Set(['false-positive','false-negative']));
  assert.equal('tn' in result,false, 'unbounded universe of DOM paths has no true-negative count');
});

test('one correct localized image cannot hide an extra spurious image warning', () => {
  const expected={...empty(),'broken-image':['#missing']};
  const observed={...empty(),'broken-image':['#missing','#unrelated']};
  const score=scoreLabeledElementLocations([row('extra',expected,observed)]);
  assert.equal(score.tp,1);
  assert.equal(score.fp,1);
  assert.equal(score.fn,0);
  assert.equal(score.precision,.5);
  assert.equal(score.recall,1);
  assert.equal(score.matchingCases,0);
});

test('truncated element evidence excludes a case rather than counting absent paths as correct', () => {
  const incomplete=row('truncated',{...empty(),'broken-image':['#missing']},empty(),{
    localizationComplete:false,
    localizationError:'16 of 20 image paths measured'
  });
  const result=scoreLabeledElementLocations([incomplete]);
  assert.equal(result.labeledCases,1);
  assert.equal(result.evaluatedCases,0);
  assert.equal(result.incompleteCases,1);
  assert.equal(result.tp,0);
  assert.equal(result.fn,0);
  assert.equal(result.recall,null);
  assert.match(result.caseResults[0].reason,/16 of 20/);
});

test('no positive locations produce null precision/recall but still test clean control cases', () => {
  const result=scoreLabeledElementLocations([row('intentional',empty(),empty())]);
  assert.equal(result.matchingCases,1);
  assert.equal(result.precision,null);
  assert.equal(result.recall,null);
  assert.equal(result.fp,0);
});

test('detector-code and element-location metrics remain independent', () => {
  const combined=scoreLabeledAuditCases([row('wrong-node',
    {...empty(),'possible-text-clipping':['#correct']},
    {...empty(),'possible-text-clipping':['#wrong']},
    { expectedReview:['possible-text-clipping'], observedReview:['possible-text-clipping'] })]);
  assert.equal(combined.review.tp,1,'the category-level classifier remains correct');
  assert.equal(combined.matchingCases,1,'the category-level page match remains correct');
  assert.equal(combined.localization.matchingCases,0,'the targeted element is wrong');
  assert.equal(combined.localization.fp,1);
  assert.equal(combined.localization.fn,1);
});

test('manifest validation rejects missing paths, duplicate paths, unapproved classes and unlabeled cases', () => {
  const missing=structuredClone(localized);
  delete missing.cases[0].expectedLocations['possible-text-clipping'];
  assert.throws(()=>validateBenchmarkManifest(missing),/must label all declared/);
  const duplicated=structuredClone(localized);
  duplicated.cases[3].expectedLocations['broken-image']=['#broken','#broken'];
  assert.throws(()=>validateBenchmarkManifest(duplicated),/duplicates/);
  const bogus=structuredClone(localized);
  bogus.cases[3].expectedLocations['document-horizontal-overflow']=['#wide'];
  assert.throws(()=>validateBenchmarkManifest(bogus),/must label all declared/);
  const noPositive=structuredClone(localized);
  noPositive.cases[3].expectedLocations['broken-image']=[];
  assert.throws(()=>validateBenchmarkManifest(noPositive),/positive detector code has no element localization/);
  const all=structuredClone(localized);
  delete all.localization;
  assert.throws(()=>validateBenchmarkManifest(all),/requires a localization declaration/);
});
