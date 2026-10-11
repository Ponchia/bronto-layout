import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { combineCSSBreakpointSamples, mediaBreakpointSamples } from '../dist/breakpoints.js';

const cwd = path.resolve(import.meta.dirname, '..');
const execute = args => spawnSync(process.execPath, ['bin/bronto-layout.mjs', ...args], {
  cwd, encoding: 'utf8', timeout: 60000,
  env: { ...process.env, BRONTO_TEST_INLINE_FIXTURE: '1', BRONTO_CHROME_NO_SANDBOX: '1' }
});

test('Media query sampler uses Chromium computed CSS pixel lengths', () => {
  const result = mediaBreakpointSamples([
    { text: '(min-width: 40rem)', mediaList: [{ expressions: [{ feature: 'min-width', unit: 'rem', value: 40, computedLength: 640 }] }] },
    { text: '(max-width: 767.98px)', mediaList: [{ expressions: [{ feature: 'max-width', unit: 'px', value: 767.98, computedLength: 767.98 }] }] },
    { text: '(prefers-reduced-motion: reduce)', mediaList: [{ expressions: [{ feature: 'prefers-reduced-motion', value: 1 }] }] }
  ], 500, 1000);
  assert.deepEqual(result.thresholds, [640, 767.98]);
  assert.deepEqual(result.widths, [639, 640, 641, 766, 767, 768, 769]);
});

test('Text fallback parses only px media thresholds, not unsupported units', () => {
  const result = mediaBreakpointSamples([
    { text: 'screen and (max-width: 700px) and (min-width: 30em)' },
    { text: 'print and (min-height: 800px)' }
  ], 600, 900);
  assert.deepEqual(result.thresholds, [700]);
  assert.deepEqual(result.widths, [699, 700, 701]);
});

test('Dedupes sources and excludes thresholds outside range', () => {
  const a = mediaBreakpointSamples([{ mediaList: [{ expressions: [
    { feature: 'width', computedLength: 700 },
    { feature: 'max-width', computedLength: 1400 }
  ] }] }], 600, 900);
  const b = mediaBreakpointSamples([{ text: '(min-width: 700px)' }], 600, 900);
  const combined = combineCSSBreakpointSamples([600, 900], a, b);
  assert.deepEqual(combined.thresholds, [700]);
  assert.deepEqual(combined.addedWidths, [699, 700, 701]);
  assert.deepEqual(combined.widths, [600, 699, 700, 701, 900]);
});

test('Rejects unbounded or invalid breakpoint sampling', () => {
  assert.throws(() => mediaBreakpointSamples([], 900, 600), /Invalid/);
  assert.throws(() => mediaBreakpointSamples([
    { text: '(min-width: 700px) and (max-width: 750px)' }
  ], 600, 900, 1), /limit/);
});

test('CLI detects a breakpoint-only failure missed by coarse scan', t => {
  const coarse = execute(['scan', '--spec', 'examples/breakpoint-contract.json', '--scan', '600:900:300', '--json']);
  if (coarse.error || /Cannot find Chrome\/Chromium/.test(coarse.stderr ?? '')) {
    if (process.env.BRONTO_REQUIRE_CHROME) throw new Error(coarse.stderr || String(coarse.error));
    t.skip('Chromium unavailable'); return;
  }
  assert.equal(coarse.status, 0, coarse.stderr || coarse.stdout);
  const baseline = JSON.parse(coarse.stdout);
  assert.deepEqual(baseline.reports.map(x => x.viewport.width), [600, 900]);

  const response = execute(['scan', '--spec', 'examples/breakpoint-contract.json',
    '--scan', '600:900:300', '--css-breakpoints', '--json']);
  assert.equal(response.status, 1, response.stderr || response.stdout);
  const data = JSON.parse(response.stdout);
  assert.equal(data.mode, 'check');
  assert.equal(data.cssBreakpointScan.thresholds.includes(701), true);
  assert.equal(data.cssBreakpointScan.thresholds.includes(799), true);
  assert.equal(data.cssBreakpointScan.addedWidths.includes(701), true);
  assert.ok(data.reports.some(r => r.summary.failed && r.viewport.width > 700 && r.viewport.width < 800));
});

test('CSS breakpoint sampling requires an explicit viewport scan range', () => {
  const response = execute(['check', '--spec', 'examples/breakpoint-contract.json', '--css-breakpoints']);
  assert.equal(response.status, 2);
  assert.match(response.stderr, /requires --scan/);
});


test('compare discovers candidate-only CSS breakpoints and reports regressions', t => {
  const result = execute(['compare', '--spec', 'examples/breakpoint-contract.json',
    '--baseline', 'examples/breakpoint-healthy.html', '--url', 'examples/breakpoint.html',
    '--scan', '600:900:300', '--css-breakpoints', '--json']);
  if (result.error || /Cannot find Chrome\/Chromium/.test(result.stderr ?? '')) {
    if (process.env.BRONTO_REQUIRE_CHROME) throw new Error(result.stderr || String(result.error));
    t.skip('Chromium unavailable'); return;
  }
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.cssBreakpointScan.thresholds.includes(701), true);
  assert.ok(report.summary.regressions > 0);
  assert.ok(report.changes.some(change => change.kind === 'regression' && change.width === 701));
});
