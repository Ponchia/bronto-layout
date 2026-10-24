import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFieldManifest } from '../scripts/field-benchmark-core.mjs';
import { parseContract } from '../dist/contract.js';

const read = filename => JSON.parse(readFileSync(new URL('../' + filename, import.meta.url), 'utf8'));
const fieldWorkflow = readFileSync(new URL('../.github/workflows/field-capture.yml', import.meta.url), 'utf8');
const smokeWorkflow = readFileSync(new URL('../.github/workflows/live-site-smoke.yml', import.meta.url), 'utf8');
const widths = [320, 360, 375, 430, 768, 1280];
const sites = [
  ['brontoui-home', 'https://ponchia.github.io/bronto-ui/'],
  ['brontoui-operations', 'https://ponchia.github.io/bronto-ui/examples/operations/']
];

test('v0.2 field cohort extends original 30 immutable states with exactly twelve new BrontoUI states', () => {
  const legacy = validateFieldManifest(read('benchmarks/field-sites.v0.1.json'));
  const expanded = validateFieldManifest(read('benchmarks/field-sites.v0.2.json'));
  assert.equal(legacy.id, 'bronto-field-first-party-v0_1');
  assert.equal(expanded.id, 'bronto-field-first-party-v0_2');
  assert.equal(legacy.cases.length, 30);
  assert.equal(expanded.cases.length, 42);
  assert.deepEqual(expanded.cases.slice(0, legacy.cases.length), legacy.cases);
  assert.deepEqual(expanded.allowedHosts, [...legacy.allowedHosts, 'ponchia.github.io']);
  assert.equal(new Set(expanded.cases.map(({ id }) => id)).size, 42);
  for (const [prefix, url] of sites) {
    const cases = expanded.cases.filter(({ id }) => id.startsWith(prefix + '-'));
    assert.deepEqual(cases.map(({ width }) => width), widths);
    assert.ok(cases.every(caseItem => caseItem.url === url && !caseItem.locale));
  }
});

test('BrontoUI layout contracts reference only known first-party pages and distinct explicit DOM constraints', () => {
  for (const [slug, url] of sites) {
    const filename = 'examples/' + slug + '.json';
    const contract = parseContract(read(filename));
    assert.equal(contract.url, url);
    assert.deepEqual(contract.widths, [320, 375, 768, 1280]);
    assert.equal(contract.rules[0].type, 'document-overflow');
    assert.ok(contract.rules.some(rule => rule.type === 'selector-count'));
    assert.ok(contract.rules.some(rule => rule.type === 'contained' && rule.axis === 'x'));
    assert.ok(new Set(contract.rules.map(rule => rule.id)).size === contract.rules.length);
  }
});

test('manual field capture dispatch admits only explicit versioned checked-in manifests', () => {
  assert.match(fieldWorkflow, /dataset:\s*\n\s*description:[^\n]+\n\s*required: true\n\s*type: choice/);
  assert.match(fieldWorkflow, /options:\s*\n\s*- v0\.1\n\s*- v0\.2/);
  assert.match(fieldWorkflow, /case "\$FIELD_DATASET" in/);
  assert.match(fieldWorkflow, /v0\.1\) manifest=benchmarks\/field-sites\.v0\.1\.json/);
  assert.match(fieldWorkflow, /v0\.2\) manifest=benchmarks\/field-sites\.v0\.2\.json/);
  assert.match(fieldWorkflow, /Unknown field dataset version/);
  assert.match(fieldWorkflow, /node scripts\/field-benchmark\.mjs capture/);
  assert.doesNotMatch(fieldWorkflow, /inputs\.(?:url|manifest|path|domain)/);
  assert.doesNotMatch(fieldWorkflow, /schedule:\s*\n/);
  assert.match(fieldWorkflow, /retention-days: 7/);
});

test('manual live smoke audits both BrontoUI sites and preserves their distinct contract checks', () => {
  const batch = read('examples/live-sites-batch.json');
  assert.equal(batch.jobs.length, 6);
  for (const [slug, url] of sites) {
    assert.ok(batch.jobs.some(({ id, spec }) => id === slug && spec === slug + '.json'));
    assert.ok(smokeWorkflow.includes(`${slug}) url="${url}"`));
    assert.ok(smokeWorkflow.includes(url));
  }
  assert.match(smokeWorkflow, /Sites with measured issues or incomplete audits: \$failures\/6/);
  assert.doesNotMatch(smokeWorkflow, /inputs\.(?:url|manifest|domain)/);
});
