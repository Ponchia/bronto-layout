import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const cwd = path.resolve(import.meta.dirname, '..');
const cli = path.join(cwd, 'bin/bronto-layout.mjs');
const spec = 'examples/portfolio-alignment.json';
const healthy = 'examples/portfolio-alignment-healthy.html';
const broken = 'examples/portfolio-alignment-broken.html';

function run(args) {
  return spawnSync(process.execPath, [cli, ...args, '--json'], {
    cwd, encoding: 'utf8', timeout: 45000, maxBuffer: 4 * 1024 * 1024,
    // This is a trusted, self-contained bundled HTML fixture, never an external URL.
    env: { ...process.env, BRONTO_TEST_INLINE_FIXTURE: '1', BRONTO_CHROME_NO_SANDBOX: '1' }
  });
}

function skipIfChromeMissing(t, result) {
  if (result.error?.code === 'ENOENT' || /Cannot find Chrome\/Chromium/.test(result.stderr || '')) {
    if (process.env.BRONTO_REQUIRE_CHROME === '1') throw new Error('Chromium required for CI');
    t.skip('Chrome unavailable');
    return true;
  }
  return false;
}

test('portfolio regression fixture contract parses with one desktop-only intent', () => {
  const result = run(['validate', '--spec', spec]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.valid, true);
  assert.equal(report.rules.length, 4);
});

test('portfolio baseline passes, and mobile intentionally skips desktop alignment', t => {
  const result = run(['check', '--spec', spec, '--url', healthy]);
  if (skipIfChromeMissing(t, result)) return;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.summary.failed, 0);
  assert.deepEqual(report.reports.map(r => r.viewport.width), [375, 768, 1280]);
  for (const viewport of report.reports) {
    const intent = viewport.findings.find(f => f.id === 'image-top-aligns-to-paragraph');
    assert.equal(intent?.status, viewport.viewport.width < 768 ? 'skip' : 'pass',
      JSON.stringify(viewport.findings));
  }
});

test('portfolio regression reports only the intentional 18px desktop shift', t => {
  const result = run(['check', '--spec', spec, '--url', broken]);
  if (skipIfChromeMissing(t, result)) return;
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.summary.failed, 2, JSON.stringify(report.summary));
  const failed = report.reports.flatMap(view => view.findings
    .filter(f => f.status === 'fail')
    .map(f => ({ width: view.viewport.width, id: f.id, deviation: f.deviation })));
  assert.deepEqual(failed.map(f => [f.width, f.id]), [
    [768, 'image-top-aligns-to-paragraph'], [1280, 'image-top-aligns-to-paragraph']
  ]);
  assert.ok(failed.every(f => f.deviation > 15 && f.deviation < 21), JSON.stringify(failed));
});

test('portfolio compare promotes precisely the two approved alignment regressions', t => {
  const result = run(['compare', '--spec', spec, '--baseline', healthy, '--url', broken]);
  if (skipIfChromeMissing(t, result)) return;
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.summary.baselineFailures, 0);
  assert.equal(report.summary.candidateFailures, 2);
  assert.equal(report.summary.regressions, 2);
  assert.equal(report.summary.improvements, 0);
});
