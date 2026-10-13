import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseContract } from '../dist/contract.js';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const source = JSON.parse(read('benchmarks/oss-source-built/manifest.json'));
const workflow = read('.github/workflows/oss-source-built-eleventy.yml');

test('independent OSS source is MIT-licensed and pinned to a reviewed immutable commit', () => {
  assert.equal(source.schemaVersion, 1);
  assert.equal(source.id, 'bronto-oss-source-built-eleventy-v0_1');
  assert.deepEqual(source.source, {
    repository: '11ty/eleventy-base-blog',
    revision: '94bd3b71d454da5b88eb505b8db6aea1cd0e9754',
    license: 'MIT', buildCommand: 'npm run build', output: '_site'
  });
  assert.equal(source.origin, 'http://127.0.0.1:18778/');
  assert.deepEqual(source.contracts, [
    'benchmarks/oss-source-built/home.json',
    'benchmarks/oss-source-built/about.json'
  ]);
});

test('source-built home and about contracts are explicit across eight responsive states', () => {
  for (const [id, url] of [
    ['home', 'http://127.0.0.1:18778/'],
    ['about', 'http://127.0.0.1:18778/about/']
  ]) {
    const c = parseContract(JSON.parse(read('benchmarks/oss-source-built/' + id + '.json')));
    assert.equal(c.schemaVersion, 1);
    assert.equal(c.url, url);
    assert.deepEqual(c.widths, [320, 375, 768, 1280]);
    assert.equal(c.rules.length, 11);
    assert.ok(c.rules.some(x => x.type === 'document-overflow'));
    assert.ok(c.rules.some(x => x.id === 'site-main-centered' && x.type === 'centered' &&
      x.element === 'main' && x.in === 'viewport' && x.axis === 'x'));
    assert.ok(c.rules.some(x => x.id === 'site-navigation-inside-header' &&
      x.type === 'contained'));
    assert.ok(c.rules.some(x => x.element === 'heading' && x.type === 'selector-count'));
    assert.deepEqual(Object.keys(c.selectors).sort(),
      ['footer', 'header', 'heading', 'main', 'navigation']);
  }
});

test('manual source-build workflow is pinned, sandboxed and includes a non-overflowing semantic negative control', () => {
  assert.match(workflow, /\non:\n\s+workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s+(?:push|pull_request|schedule|workflow_call):/);
  assert.match(workflow, /permissions:\n\s+contents: read/);
  assert.match(workflow, /repository: 11ty\/eleventy-base-blog/);
  assert.match(workflow, /ref: 94bd3b71d454da5b88eb505b8db6aea1cd0e9754/);
  assert.match(workflow, /git -C \.external-eleventy rev-parse HEAD/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /npm --prefix \.external-eleventy run build/);
  assert.match(workflow, /http\.server 18778 --bind 127\.0\.0\.1/);
  assert.match(workflow, /CHROME_PATH: \/usr\/bin\/google-chrome/);
  assert.match(workflow, /doctor --verify-launch --json/);
  assert.match(workflow, /#main\{transform:translateX\(18px\)!important\}/);
  assert.match(workflow, /site-main-centered/);
  assert.match(workflow, /generic\.summary\.measuredIssues !== 0/);
  assert.match(workflow, /failures\.length !== 1/);
  assert.match(workflow, /sha256sum --check SHA256SUMS/);
  assert.match(workflow, /retention-days: 7/);
  assert.doesNotMatch(workflow, /BRONTO_CHROME_NO_SANDBOX|--no-sandbox|--disable-web-security/);
  assert.doesNotMatch(workflow, /inputs\.(?:url|host|repo|command|manifest|path)/);
  assert.doesNotMatch(workflow, /npm publish|--legacy-peer-deps|--force/);
});
