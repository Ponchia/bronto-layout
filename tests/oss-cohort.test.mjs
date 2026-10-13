import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFieldManifest } from '../scripts/field-benchmark-core.mjs';

const rootURL = new URL('../', import.meta.url);
const read = pathname => readFileSync(new URL(pathname, rootURL), 'utf8');
const cohort = JSON.parse(read('benchmarks/oss-sites.v0.1.json'));
const workflow = read('.github/workflows/oss-field-capture.yml');
const widths = [320, 375, 768, 1280];
const routes = new Map([
  ['astro-en', 'https://docs.astro.build/en/getting-started/'],
  ['astro-es', 'https://docs.astro.build/es/getting-started/'],
  ['docusaurus', 'https://docusaurus.io/docs/'],
  ['vite', 'https://vite.dev/guide/'],
  ['svelte', 'https://svelte.dev/docs/svelte/overview'],
  ['excalidraw', 'https://excalidraw.com/'],
]);

test('external OSS cohort is 24 fixed, allowlisted public viewport cases', () => {
  assert.deepEqual(validateFieldManifest(cohort), cohort);
  assert.equal(cohort.id, 'bronto-field-external-oss-v0_1');
  assert.equal(cohort.cases.length, 24);
  assert.deepEqual(cohort.allowedHosts, [...new Set([...routes.values()].map(u => new URL(u).hostname))]);
  assert.equal(new Set(cohort.cases.map(({ id }) => id)).size, 24);
  for (const [id, url] of routes) {
    const cases = cohort.cases.filter(c => c.id.startsWith(id + '-'));
    assert.deepEqual(cases.map(c => c.width), widths, id);
    assert.ok(cases.every(c => c.url === url), id);
    assert.ok(cases.every(c => c.locale === undefined || (id === 'astro-es' && c.locale === 'es')));
  }
  assert.ok(cohort.cases.every(({ url }) => !url.includes('ponchia') &&
    !url.includes('sense6') && !url.includes('brontolotto') && !url.includes('chiara-renda')));
});

test('manual OSS capture cannot target arbitrary websites or bypass sandbox', () => {
  assert.match(workflow, /\non:\n\s+workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s+pull_request:\n|\n\s+push:\n|\n\s+schedule:\n/);
  assert.match(workflow, /options:\n\s+- all\n\s+- docs-only\n\s+- excalidraw-only/);
  assert.match(workflow, /- astro-only/);
  assert.match(workflow, /m.cases.filter\(x=>x.id.startsWith\('astro-'\)\)/);
  assert.match(workflow, /case "\$COHORT" in/);
  assert.match(workflow, /Unexpected fixed cohort choice/);
  assert.match(workflow, /manifest=benchmarks\/oss-sites\.v0\.1\.json/);
  assert.match(workflow, /--manifest "\$manifest"/);
  assert.doesNotMatch(workflow, /inputs\.(?:url|host|domain|manifest|path|command)/);
  assert.match(workflow, /CHROME_PATH: \/usr\/bin\/google-chrome/);
  assert.match(workflow, /doctor --verify-launch --json/);
  assert.doesNotMatch(workflow, /BRONTO_CHROME_NO_SANDBOX|--no-sandbox|--disable-web-security/);
  assert.match(workflow, /permissions:\n\s+contents: read/);
  assert.match(workflow, /retention-days: 7/);
  assert.match(workflow, /review-label-template/);
  assert.match(workflow, /review-gallery/);
});

test('original first-party benchmarks remain independent of external OSS dataset', () => {
  const original = JSON.parse(read('benchmarks/field-sites.v0.1.json'));
  const extended = JSON.parse(read('benchmarks/field-sites.v0.2.json'));
  assert.equal(original.cases.length, 30);
  assert.equal(extended.cases.length, 42);
  assert.deepEqual(extended.cases.slice(0, original.cases.length), original.cases);
  for (const host of cohort.allowedHosts) assert.ok(!extended.allowedHosts.includes(host), host);
});
