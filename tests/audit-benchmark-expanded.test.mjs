import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateBenchmarkManifest } from '../scripts/audit-benchmark-metrics.mjs';

const baseline = JSON.parse(fs.readFileSync(
  new URL('../benchmarks/audit-controlled-v0.1.json', import.meta.url)));
const expanded = JSON.parse(fs.readFileSync(
  new URL('../benchmarks/audit-controlled-v0.2.json', import.meta.url)));

test('expanded benchmark is versioned and retains all 13 original labels unchanged', () => {
  validateBenchmarkManifest(baseline);
  validateBenchmarkManifest(expanded);
  assert.equal(expanded.id, 'bronto-audit-controlled-v0.2');
  assert.equal(baseline.cases.length, 13);
  assert.equal(expanded.cases.length, 31);
  assert.deepEqual(expanded.cases.slice(0,13), baseline.cases);
  assert.equal(new Set(expanded.cases.map(item => item.id)).size,31);
});

test('extended fixture matrix covers container thresholds, RTL and open-shadow resources', () => {
  const cases = new Map(expanded.cases.map(item=>[item.id,item]));
  const overflows = new Set(cases.get('container-query-320').expectedMeasured);
  assert.ok(overflows.has('document-horizontal-overflow'));
  assert.ok(cases.get('container-query-430').expectedMeasured.includes('document-horizontal-overflow'));
  assert.deepEqual(cases.get('container-query-450').expectedMeasured,[]);
  assert.deepEqual(cases.get('container-query-768').expectedMeasured,[]);
  for(const width of [320,768,1280]){
    assert.ok(cases.get('rtl-overflow-'+width).expectedMeasured.includes('document-horizontal-overflow'));
    assert.ok(cases.get('mixed-image-state-'+width).expectedMeasured.includes('broken-image'));
  }
  for(const width of [320,375,1280]) {
    assert.deepEqual(cases.get('intentional-overlap-'+width).expectedMeasured,[]);
    assert.deepEqual(cases.get('intentional-overlap-'+width).expectedReview,[]);
  }
  assert.ok(cases.get('open-shadow-image-320').expectedMeasured.includes('broken-image'));
  assert.ok(cases.get('open-shadow-image-768').expectedMeasured.includes('broken-image'));
});

test('iframe coverage is explicitly a review warning, not a fabricated inner-layout error',()=>{
  for(const name of ['iframe-coverage-320','iframe-coverage-768']){
    const match=expanded.cases.find(item=>item.id===name);
    assert.deepEqual(match.expectedMeasured,[]);
    assert.deepEqual(match.expectedReview,['embedded-frame-uninspected']);
  }
});

test('all expanded test sources are tracked, local and unique across independent cases', () => {
  for(const c of expanded.cases){
    assert.match(c.fixture,/^[a-z0-9][a-z0-9_.-]*\.html$/);
    assert.ok(fs.existsSync(new URL('../examples/'+c.fixture,import.meta.url)), c.fixture);
    assert.ok(c.labelReason.length>=25);
  }
});
