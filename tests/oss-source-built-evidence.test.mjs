import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyEleventyEvidence } from '../scripts/verify-oss-source-build-evidence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function writeJSON(filename, value) {
  writeFileSync(filename, JSON.stringify(value, null, 2) + '\n');
}
function pngFixture(width) {
  // Minimal IHDR metadata mock; production evidence is real Chromium PNG.
  const bytes = Buffer.alloc(128, 0);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes, 0);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(900, 20);
  return bytes;
}
function createReports(dir, bad = false) {
  const widths = [320, 375, 768, 1280];
  for (const route of ['home', 'about']) {
    const url = 'http://127.0.0.1:18778/' + (route === 'about' ? 'about/' : '');
    writeJSON(path.join(dir, route + '-baseline.json'), {
      url, summary: { passed: 44, failed: 0, skipped: 0 },
      reports: widths.map(width => ({ viewport: { width } }))
    });
    mkdirSync(path.join(dir, route, 'screens'), { recursive: true });
    for (const width of widths) {
      const filename = route + '/screens/audit-' + width + 'px.png';
      const fullpath = path.join(dir, filename);
      writeFileSync(fullpath, pngFixture(width));
      writeJSON(path.join(dir, route + '-audit-' + width + '.json'), {
        mode: 'audit', browser: { actualUrl: url },
        summary: { viewports: 1, measuredIssues: 0, incompleteViewports: 0, reviewWarnings: 0 },
        reports: [{
          width, summary: { supportedScopeMeasured: true },
          coverage: { status: 'supported-scope-measured' },
          screenshot: { file: fullpath, coverage: 'viewport-only' }
        }]
      });
    }
  }
  mkdirSync(path.join(dir, 'mutation', 'screens'), { recursive: true });
  mkdirSync(path.join(dir, 'mutation', 'annotated'), { recursive: true });
  const screenshot = path.join(dir, 'mutation', 'screens', 'audit-1280px.png');
  const annotated = path.join(dir, 'mutation', 'annotated', 'check-1280px.png');
  writeFileSync(screenshot, pngFixture(1280));
  writeFileSync(annotated, pngFixture(1280));
  writeJSON(path.join(dir, 'generic-mutated-audit.json'), {
    summary: { measuredIssues: 0, incompleteViewports: 0 },
    reports: [{ screenshot: { file: screenshot, coverage: 'viewport-only' } }]
  });
  writeJSON(path.join(dir, 'semantic-mutated-check.json'), {
    summary: { failed: 1 },
    reports: [{ findings: [
      { id: 'site-main-centered', status: 'fail', deviation: bad ? 0 : 18 }
    ] }],
    evidence: [{ width: 1280, screenshot: annotated }]
  });
}

test('pinned OSS generated website reviewer index includes eight real paths plus paired 18px mutation evidence', () => {
  const base = path.join(root, 'reports');
  mkdirSync(base, { recursive: true });
  const directory = mkdtempSync(path.join(base, 'eleventy-evidence-unit-'));
  try {
    createReports(directory);
    const report = verifyEleventyEvidence(directory);
    assert.equal(report.cohortId, 'bronto-oss-source-built-eleventy-v0_1');
    assert.equal(report.observedStates, 8);
    assert.equal(report.approvedEvaluations, 88);
    assert.equal(report.mutation.deviationPx, 18);
    assert.equal(report.baselineScreenshots.length, 8);
    for (const entry of report.baselineScreenshots) {
      assert.ok(entry.screenshot.file.startsWith(entry.route + '/screens/'));
      assert.match(entry.screenshot.sha256, /^[0-9a-f]{64}$/);
      assert.equal(entry.screenshot.width, entry.width);
      assert.equal(entry.screenshot.height, 900);
      assert.equal(entry.verifiedTopDocumentScope, true);
      const normalized = JSON.parse(readFileSync(path.join(directory, entry.auditFile)));
      assert.equal(normalized.reports[0].screenshot.file, entry.screenshot.file);
      assert.equal(normalized.reports[0].screenshot.sha256, entry.screenshot.sha256);
    }
    assert.equal(report.mutation.screenshot.file, 'mutation/screens/audit-1280px.png');
    assert.equal(report.mutation.annotatedScreenshot.file, 'mutation/annotated/check-1280px.png');
    assert.ok(readFileSync(path.join(directory, 'index.json')).length > 100);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('source-build evidence verifier rejects absence/tampering of visual and semantic evidence', () => {
  const base = path.join(root, 'reports');
  mkdirSync(base, { recursive: true });
  const directory = mkdtempSync(path.join(base, 'eleventy-evidence-negative-'));
  try {
    createReports(directory, true);
    assert.throws(() => verifyEleventyEvidence(directory), /18px center deviation/);
    createReports(directory);
    const f = path.join(directory, 'home', 'screens', 'audit-320px.png');
    writeFileSync(f, pngFixture(375));
    assert.throws(() => verifyEleventyEvidence(directory), /Wrong PNG viewport width/);
    createReports(directory);
    const audit = path.join(directory, 'about-audit-768.json');
    const report = JSON.parse(readFileSync(audit));
    report.reports[0].screenshot.file = '/tmp/other/unsafe.png';
    writeJSON(audit, report);
    assert.throws(() => verifyEleventyEvidence(directory), /Unexpected screenshot source/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Eleventy source-build workflow really captures healthy and mutated screenshots and validates archive index', () => {
  const w = readFileSync(path.join(root, '.github/workflows/oss-source-built-eleventy.yml'), 'utf8');
  assert.match(w, /for width in 320 375 768 1280; do/);
  assert.match(w, /--evidence-dir "\$out\/\$route\/screens"/);
  assert.match(w, /--evidence-dir "\$out\/mutation\/screens"/);
  assert.match(w, /--evidence-dir "\$out\/mutation\/annotated"/);
  assert.match(w, /node scripts\/verify-oss-source-build-evidence\.mjs --out "\$out"/);
  assert.match(w, /sha256sum --check SHA256SUMS/);
  assert.match(w, /CHROME_PATH: \/usr\/bin\/google-chrome/);
  assert.doesNotMatch(w, /BRONTO_CHROME_NO_SANDBOX|--no-sandbox/);
});
