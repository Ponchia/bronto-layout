import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { validateFieldManifest, validateFieldLabels, scoreFieldEvidence } from '../scripts/field-benchmark-core.mjs';
const root = path.resolve(import.meta.dirname, '..');
const runner = path.join(root, 'scripts/field-benchmark.mjs');
const protocol = 'Review actual rendered page and screenshot before viewing any automatic detector findings.';
const reviewed = id => ({ id, reviewStatus: 'reviewed', reviewer: 'Test Reviewer',
  reviewedAt: '2026-10-12', rationale: 'Fixtures simulate an independently inspected page, not a real benchmark result.',
  reviewedScreenshot: true, reviewedRenderedPage: true,
  expectedMeasured: ['broken-image'], expectedReview: [] });
test('field manifests refuse unapproved hosts and fixture use without opt-in', () => {
  const basic = { schemaVersion: 1, id: 'field-check', allowedHosts: ['example.com'],
    cases: [{ id: 'page-375', url: 'https://example.com/', width: 375 }] };
  assert.equal(validateFieldManifest(basic).cases.length, 1);
  assert.throws(() => validateFieldManifest({ ...basic, cases: [
    { id: 'other', url: 'https://unapproved.example/', width: 375 }] }), /allowlisted/);
  assert.throws(() => validateFieldManifest({ ...basic, cases: [
    { id: 'fixture', url: 'examples/audit-healthy.html', width: 375 }] }), /--fixtures/);
  assert.equal(validateFieldManifest({ ...basic, cases: [
    { id: 'fixture', url: 'examples/audit-healthy.html', width: 375 }] }, true).cases.length, 1);
});
test('unreviewed cases never turn into true negatives', () => {
  const cases = [
    { id: 'reviewed', width: 375, complete: true, screenshotVerified: true },
    { id: 'pending', width: 768, complete: true, screenshotVerified: true }
  ];
  const labels = { schemaVersion: 1, datasetId: 'field-review', reviewProtocol: protocol,
    cases: [reviewed('reviewed')] };
  const observed = { reviewed: { mode: 'audit', summary: { viewports: 1 }, reports: [{
    width: 375, summary: { verified: true }, coverage: { truncated: false },
    findings: [{ code: 'broken-image', classification: 'measured' },
      { code: 'possible-text-clipping', classification: 'review' }]
  }] } };
  const result = scoreFieldEvidence({ schemaVersion: 1, datasetId: 'field-review', cases }, labels, observed);
  assert.deepEqual(result.pending, ['pending']);
  assert.equal(result.metrics.evaluatedCases, 1);
  assert.equal(result.metrics.measured.tp, 1);
  assert.equal(result.metrics.review.fp, 1);
  assert.equal(result.metrics.review.precision, 0);
  const incomplete = scoreFieldEvidence({ schemaVersion: 1, datasetId: 'field-review',
    cases: cases.map(c => ({ ...c, screenshotVerified: false })) }, labels, observed);
  assert.equal(incomplete.metrics.incompleteCases, 1);
  assert.equal(incomplete.metrics.evaluatedCases, 0);
  assert.throws(() => validateFieldLabels({ ...labels, cases: [
    { ...reviewed('reviewed'), reviewedScreenshot: false }] }, 'field-review',
  cases.map(c => c.id)), /attest/);
});
test('fixture-only field capture hashes screenshot/report and refuses tampered review evidence', t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bronto-field-test-'));
  const exec = args => spawnSync(process.execPath, [runner, ...args], {
    cwd: root, encoding: 'utf8', timeout: 90000,
    env: { ...process.env, BRONTO_CHROME_NO_SANDBOX: '1', BRONTO_TEST_INLINE_FIXTURE: '1' }
  });
  try {
    const manifest = path.join(dir, 'manifest.json');
    const output = path.join(dir, 'capture');
    const labelsFile = path.join(dir, 'labels.json');
    writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, id: 'fixture-plumbing',
      allowedHosts: [], cases: [{ id: 'fixture-375', url: 'examples/audit-healthy.html', width: 375 }] }));
    const capture = exec(['capture', '--fixtures', '--manifest', manifest, '--out', output]);
    if (/Cannot find Chrome\/Chromium/.test(capture.stdout + capture.stderr)) {
      if (process.env.BRONTO_REQUIRE_CHROME === '1') throw new Error('Chromium required');
      t.skip('Chromium unavailable'); return;
    }
    assert.equal(capture.status, 0, capture.stderr || capture.stdout);
    const index = JSON.parse(readFileSync(path.join(output, 'index.json'), 'utf8'));
    assert.equal(index.cases[0].complete, true);
    assert.equal(index.cases[0].screenshotSha256.length, 64);
    const label = { ...reviewed('fixture-375'), expectedMeasured: [] };
    writeFileSync(labelsFile, JSON.stringify({ schemaVersion: 1, datasetId: index.datasetId,
      reviewProtocol: protocol, cases: [label] }));
    assert.equal(exec(['score', '--captures', output, '--labels', labelsFile, '--assert']).status, 0);
    const screenshot = path.join(output, index.cases[0].screenshotFile);
    writeFileSync(screenshot, Buffer.concat([readFileSync(screenshot), Buffer.from('altered')]));
    const score = exec(['score', '--captures', output, '--labels', labelsFile, '--assert', '--json']);
    assert.equal(score.status, 2, score.stderr || score.stdout);
    assert.equal(JSON.parse(score.stdout).metrics.incompleteCases, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
