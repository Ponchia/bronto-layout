import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, renameSync, rmSync
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  fixedScrollPlan, validateBrowserResult, validateCompactScroll, writeChecksums
} from '../scripts/run-oss-deep-scroll.mjs';

const workflow = readFileSync(
  new URL('../.github/workflows/oss-scroll-state-smoke.yml', import.meta.url), 'utf8'
);
const plan = fixedScrollPlan();

test('external long-page scroll plan has exactly four fixed source-reviewed states', () => {
  assert.deepEqual(plan.map(p => [p.id, p.url, p.widths, p.selectors.target]), [
    ['docusaurus', 'https://docusaurus.io/docs/', [320, 1280], '#something-missing'],
    ['vite', 'https://vite.dev/guide/', [320, 1280], '#command-line-interface']
  ]);
  for (const spec of plan) {
    assert.deepEqual(spec.actions, [
      { type: 'scroll-into-view', selector: spec.selectors.target },
      { type: 'pause', milliseconds: 180 }
    ]);
    assert.equal(spec.rules.length, 3);
    assert.ok(spec.rules.some(r => r.id === 'deep-section-visible-in-viewport' &&
      r.type === 'contained' && r.axis === 'y' && r.in === 'viewport'));
  }
});

test('external OSS workflow is manual, read-only, sandboxed and fixed to reviewed URLs', () => {
  assert.match(workflow, /\non:\n\s+workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s+(?:push|pull_request|schedule):/);
  assert.match(workflow, /permissions:\n\s+contents: read/);
  assert.match(workflow, /CHROME_PATH: \/usr\/bin\/google-chrome/);
  assert.match(workflow, /doctor --verify-launch --json/);
  assert.match(workflow, /run-oss-deep-scroll\.mjs --plan/);
  assert.match(workflow, /run-oss-deep-scroll\.mjs --out "reports\/oss-deep-scroll-\$GITHUB_RUN_ID"/);
  assert.match(workflow, /retention-days: 7/);
  assert.doesNotMatch(workflow, /BRONTO_CHROME_NO_SANDBOX|--no-sandbox|--disable-web-security/);
  assert.doesNotMatch(workflow, /inputs\.(?:url|host|domain|manifest|path|command)/);
});

test('scroll evidence requires an actual >1000 CSS px offset, correct fixed URL and reached contract', () => {
  const spec = plan[0], width = 320;
  const checked = { status: 0, output: JSON.stringify({
    reports: [{
      viewport: { width, scrollY: 5400 },
      summary: { failed: 0, skipped: 0 },
      findings: [{ id: 'deep-section-visible-in-viewport', status: 'pass' }]
    }]
  }) };
  const audited = { status: 0, output: JSON.stringify({
    browser: { actualUrl: spec.url },
    reports: [{ width, scrollY: 5390, summary: { supportedScopeMeasured: true },
      coverage: { status: 'supported-scope-measured' }, findings: [] }]
  }) };
  const result = validateBrowserResult(spec, width, checked, audited);
  assert.equal(result.auditScrollY, 5390);
  assert.equal(result.checkScrollY, 5400);
  assert.equal(result.coverageStatus, 'supported-scope-measured');
  assert.throws(() => validateBrowserResult(spec, width,
    { ...checked, output: checked.output.replace('"scrollY":5400', '"scrollY":0') },
    audited), /scroll/);
  assert.throws(() => validateBrowserResult(spec, width, checked,
    { ...audited, output: audited.output.replace('"scrollY":5390', '"scrollY":0') }), /scroll/);
  assert.throws(() => validateBrowserResult(spec, width, checked,
    { ...audited, output: audited.output.replace(spec.url, 'https://example.com/') }), /redirected/);
  assert.throws(() => validateBrowserResult(spec, width, { ...checked, status: 2 }, audited), /CLI check exit/);
});

test('compact agent scroll state independently verifies deep positions and rejects missing metadata', () => {
  const spec = plan[0];
  const original = { status: 0, output: JSON.stringify({
    mode: 'check', format: 'compact', url: spec.url,
    summary: { passed: 6, failed: 0, skipped: 0 },
    sampledWidths: [320, 1280],
    scrollOffsets: [
      { width: 320, scrollX: 0, scrollY: 12055 },
      { width: 1280, scrollX: 0, scrollY: 6980 }
    ]
  }) };
  assert.deepEqual(validateCompactScroll(spec, 320, original),
    { compactCheckScrollX: 0, compactCheckScrollY: 12055 });
  assert.deepEqual(validateCompactScroll(spec, 1280, original),
    { compactCheckScrollX: 0, compactCheckScrollY: 6980 });
  assert.throws(() => validateCompactScroll(spec, 320,
    { ...original, output: original.output.replace('scrollOffsets', 'omittedOffsets') }), /lost approved scroll/);
  assert.throws(() => validateCompactScroll(spec, 320,
    { ...original, output: original.output.replace('12055', '0') }), /did not preserve/);
  assert.throws(() => validateCompactScroll(spec, 320,
    { ...original, output: original.output.replace(spec.url, 'https://example.com/') }), /reviewed public page/);
  assert.throws(() => validateCompactScroll(spec, 320,
    { ...original, output: original.output.replace('320,1280', '320,1280,1440') }), /lost approved scroll/);
  assert.throws(() => validateCompactScroll(spec, 320, { ...original, status: 2 }), /failed with exit/);
});

test('archived SHA256 evidence is portable and detects tampered files after relocation', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'bronto-deep-scroll-'));
  try {
    const dir = path.join(temp, 'reports', 'oss-deep-scroll-1');
    mkdirSync(path.join(dir, 'docusaurus', 'screens-320'), { recursive: true });
    for (const [file, contents] of [
      ['docusaurus/check.json', '{"summary":{"passed":6}}\n'],
      ['docusaurus/audit-320.json', '{"reports":[]}\n'],
      ['docusaurus/audit-1280.json', '{"reports":[]}\n'],
      ['docusaurus/actions.json', '[]\n'],
      ['docusaurus/screens-320/audit-320px.png', 'synthetic screenshot'],
      ['results.json', '{"complete":4}\n'],
      ['results.txt', 'proof\n']
    ]) writeFileSync(path.join(dir, file), contents);
    const count = writeChecksums(dir);
    assert.equal(count, 7);
    const manifest = readFileSync(path.join(dir, 'SHA256SUMS'), 'utf8');
    assert.ok(!manifest.includes(dir), 'Full CI workspace paths must not appear');
    assert.ok(manifest.includes('  ./docusaurus/screens-320/audit-320px.png'));
    const moved = path.join(temp, 'unpacked artifact');
    renameSync(dir, moved);
    const run = () => spawnSync('bash', ['-c', 'sha256sum --check SHA256SUMS'], {
      cwd: moved, encoding: 'utf8', timeout: 10000
    });
    assert.equal(run().status, 0);
    writeFileSync(path.join(moved, 'docusaurus', 'check.json'), 'tampered');
    assert.notEqual(run().status, 0);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
