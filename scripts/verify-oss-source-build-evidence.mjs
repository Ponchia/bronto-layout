#!/usr/bin/env node
/**
 * Verify and index the pinned independent Eleventy generated-site study.
 * Evidence consists of public website screenshots plus read-only reports.
 * This is not an arbitrary website capture/assessment or a human labeler.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = JSON.parse(readFileSync(path.join(root, 'benchmarks/oss-source-built/manifest.json'), 'utf8'));
const variants = ['home', 'about'];
const widths = [320, 375, 768, 1280];

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function safeFile(base, filename) {
  const file = path.resolve(base, filename);
  assert.ok(file.startsWith(base + path.sep), 'Evidence must remain in its output directory');
  assert.ok(lstatSync(file).isFile(), 'Evidence must be a regular file: ' + filename);
  return file;
}
function jsonAt(base, file) {
  return JSON.parse(readFileSync(safeFile(base, file), 'utf8'));
}
function pngAt(base, file, width) {
  const bytes = readFileSync(safeFile(base, file));
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Not PNG: ' + file);
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', 'Missing PNG header: ' + file);
  assert.equal(bytes.readUInt32BE(16), width, 'Wrong PNG viewport width: ' + file);
  const height = bytes.readUInt32BE(20);
  assert.ok(height >= 200 && height <= 5000, 'Invalid/bounded screenshot height: ' + file);
  return { file, sha256: digest(bytes), width, height, bytes: bytes.length };
}
function expectedURL(route) {
  return source.origin + (route === 'home' ? '' : 'about/');
}
function verifiedReportURL(data, route) {
  const expected = new URL(expectedURL(route));
  const actual = new URL(data.browser?.actualUrl ?? '');
  assert.equal(actual.origin, expected.origin, 'Site escaped loopback origin');
  assert.equal(actual.pathname, expected.pathname, 'Wrong generated site route');
}
function relativeScreenshot(base, raw, expected) {
  const abs = path.resolve(raw);
  const file = path.resolve(base, expected);
  assert.equal(abs, file, 'Unexpected screenshot source from browser evidence');
  return expected;
}

export function verifyEleventyEvidence(directory) {
  const base = path.resolve(directory);
  assert.ok(base.startsWith(path.join(root, 'reports') + path.sep),
    'Evidence output must be under ignored reports directory');
  assert.equal(source.source.repository, '11ty/eleventy-base-blog');
  assert.equal(source.source.revision, '94bd3b71d454da5b88eb505b8db6aea1cd0e9754');
  const observations = [];

  for (const route of variants) {
    const checked = jsonAt(base, route + '-baseline.json');
    assert.deepEqual(checked.summary, { passed: 44, failed: 0, skipped: 0 });
    assert.deepEqual(checked.reports.map(r => r.viewport.width), widths);
    assert.equal(checked.url, expectedURL(route));
    for (const width of widths) {
      const reportFile = route + '-audit-' + width + '.json';
      const audit = jsonAt(base, reportFile);
      assert.equal(audit.mode, 'audit');
      assert.equal(audit.summary.viewports, 1);
      assert.equal(audit.summary.measuredIssues, 0,
        'Generated independent source build must not have a measured layout issue');
      assert.equal(audit.summary.incompleteViewports, 0);
      verifiedReportURL(audit, route);
      assert.equal(audit.reports.length, 1);
      const view = audit.reports[0];
      assert.equal(view.width, width);
      assert.equal(view.summary.supportedScopeMeasured, true,
        'A browser traversal that is incomplete cannot be labeled healthy');
      const filename = route + '/screens/audit-' + width + 'px.png';
      const original = view.screenshot?.file;
      assert.ok(original, 'The healthy contract screenshot must actually exist: ' + filename);
      relativeScreenshot(base, original, filename);
      const screenshot = pngAt(base, filename, width);
      // Consumers can open a downloaded report without the CI runner's absolute
      // workspace path. The checksum of the normalized JSON is included by the
      // workflow after this process completes.
      view.screenshot.file = filename;
      view.screenshot.sha256 = screenshot.sha256;
      writeFileSync(path.join(base, reportFile), JSON.stringify(audit, null, 2) + '\n');
      observations.push({
        route, width, url: expectedURL(route),
        contractFile: route + '-baseline.json',
        auditFile: reportFile,
        screenshot,
        reviewWarnings: audit.summary.reviewWarnings,
        coverageStatus: view.coverage.status,
        verifiedTopDocumentScope: view.summary.supportedScopeMeasured
      });
    }
  }

  const generic = jsonAt(base, 'generic-mutated-audit.json');
  const semantic = jsonAt(base, 'semantic-mutated-check.json');
  assert.equal(generic.summary.measuredIssues, 0);
  assert.equal(generic.summary.incompleteViewports, 0);
  assert.equal(semantic.summary.failed, 1);
  const failed = semantic.reports.flatMap(r => r.findings.filter(f => f.status === 'fail'));
  assert.equal(failed.length, 1);
  assert.equal(failed[0].id, 'site-main-centered');
  assert.ok(failed[0].deviation >= 16 && failed[0].deviation <= 20,
    'Semantic mutation must be a measured 18px center deviation');
  const mutationScreenshot = 'mutation/screens/audit-1280px.png';
  assert.equal(generic.reports?.length, 1);
  relativeScreenshot(base, generic.reports[0].screenshot?.file, mutationScreenshot);
  const mutatedAuditImage = pngAt(base, mutationScreenshot, 1280);
  generic.reports[0].screenshot.file = mutationScreenshot;
  generic.reports[0].screenshot.sha256 = mutatedAuditImage.sha256;
  writeFileSync(path.join(base, 'generic-mutated-audit.json'), JSON.stringify(generic, null, 2) + '\n');

  const annotated = 'mutation/annotated/check-1280px.png';
  assert.equal(semantic.evidence?.length, 1, 'Failing semantic rule should produce an annotated screenshot');
  relativeScreenshot(base, semantic.evidence[0].screenshot, annotated);
  const annotatedImage = pngAt(base, annotated, 1280);
  semantic.evidence[0].screenshot = annotated;
  semantic.evidence[0].sha256 = annotatedImage.sha256;
  writeFileSync(path.join(base, 'semantic-mutated-check.json'), JSON.stringify(semantic, null, 2) + '\n');

  const index = {
    schemaVersion: 1,
    cohortId: source.id,
    source: source.source,
    provenance: 'Generated by pinned OSS source at exact immutable revision in sandboxed Chrome',
    observedStates: observations.length,
    approvedEvaluations: 88,
    baselineScreenshots: observations,
    mutation: {
      width: 1280,
      measuredOverflow: 0,
      failedRule: failed[0].id,
      deviationPx: failed[0].deviation,
      genericAudit: 'generic-mutated-audit.json',
      semanticContract: 'semantic-mutated-check.json',
      screenshot: mutatedAuditImage,
      annotatedScreenshot: annotatedImage
    },
    limitations: [
      'Viewport images and DOM geometry do not prove complete visual correctness',
      'No independently assigned human ground truth or precision/recall',
      'CSS mutation is deliberate and is not an upstream Eleventy defect',
      'No visual pixel-comparison or cross-browser agreement asserted'
    ]
  };
  writeFileSync(path.join(base, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  return index;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--out' ||
      !/^reports\/source-eleventy-[1-9]\d*$/.test(args[1]))
    throw new Error('Usage: node scripts/verify-oss-source-build-evidence.mjs --out reports/source-eleventy-RUN_ID');
  const result = verifyEleventyEvidence(path.join(root, args[1]));
  process.stdout.write(JSON.stringify({
    cohort: result.cohortId, screenshots: result.baselineScreenshots.length,
    approvedRules: result.approvedEvaluations, mutatedDeviation: result.mutation.deviationPx,
    index: args[1] + '/index.json'
  }) + '\n');
}
