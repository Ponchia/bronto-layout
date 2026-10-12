#!/usr/bin/env node
/** Collect reproducible real-website audit evidence; score separately reviewed
 * labels only. Screenshots and page reports are local artifacts, never published.
 */
import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIELD_REVIEW_PROTOCOL, validateFieldManifest, validateFieldLabels, scoreFieldEvidence } from './field-benchmark-core.mjs';
import { renderFieldReviewGallery } from './field-review-gallery.mjs';
import { renderFieldReviewConsole } from './field-review-console.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const action = argv.shift();
function opt(name, fallback) {
  const pos = argv.indexOf(name);
  if (pos < 0) return fallback;
  if (!argv[pos + 1] || argv[pos + 1].startsWith('--')) throw new Error(name + ' requires a value');
  return argv[pos + 1];
}
const has = flag => argv.includes(flag);
const readJSON = file => JSON.parse(readFileSync(file, 'utf8'));
const sha = data => createHash('sha256').update(data).digest('hex');
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const validPNG = data => data.length >= 8 && data.subarray(0, 8).equals(pngSignature);
const ensureInside = (dir, filename) => {
  const resolved = path.resolve(dir, filename);
  const root = path.resolve(dir);
  if (!resolved.startsWith(root + path.sep)) throw new Error('Evidence path escapes capture directory');
  // A path inside the directory can still symlink out of it. No evidence
  // inside a downloaded archive may make us read or link to arbitrary files.
  if (existsSync(resolved)) {
    const realRoot = realpathSync(root);
    const realFile = realpathSync(resolved);
    if (!realFile.startsWith(realRoot + path.sep))
      throw new Error('Evidence path resolves outside capture directory');
  }
  return resolved;
};
function writeJSON(file, data) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}
function usage() {
  return `Bronto Layout field benchmark — independent human labels only
Usage:
  node scripts/field-benchmark.mjs validate --manifest benchmarks/field-sites.v0.1.json
  node scripts/field-benchmark.mjs capture --manifest FILE --out reports/field-run [--ids id,id] [--frame-inventory] [--full-page-evidence]
  node scripts/field-benchmark.mjs score --captures reports/field-run --labels FILE [--json] [--assert]
  node scripts/field-benchmark.mjs review-packet --captures reports/field-run --out review.md [--json]
  node scripts/field-benchmark.mjs review-gallery --captures reports/field-run --out gallery.html [--json]
  node scripts/field-benchmark.mjs review-console --captures reports/field-run --out review-console.html [--json]
  node scripts/field-benchmark.mjs review-label-template --captures reports/field-run --out labels-draft.json [--json]
  node scripts/field-benchmark.mjs review-progress --captures reports/field-run --labels labels-draft.json [--json]
Options: --fixtures for explicitly local test fixtures; --report FILE for score JSON.
Captures are not ground-truth labels. Scores exclude unreviewed/unavailable states.`;
}
function assertKnownOptions() {
  const values = new Set(['--manifest', '--out', '--captures', '--labels', '--ids', '--report']);
  const flags = new Set(['--fixtures', '--json', '--assert', '--help', '--frame-inventory', '--full-page-evidence']);
  for (let i = 0; i < argv.length; i++) {
    if (values.has(argv[i])) { i++; if (i >= argv.length) throw new Error('Missing argument value'); }
    else if (!flags.has(argv[i])) throw new Error('Unknown benchmark option: ' + argv[i]);
  }
}
function fixtureURL(value) {
  if (!value.startsWith('examples/')) return value;
  const resolved = ensureInside(path.join(root, 'examples'), value.slice('examples/'.length));
  if (!existsSync(resolved) || !statSync(resolved).isFile()) throw new Error('Missing local fixture: ' + value);
  return resolved;
}
function sourceVersion() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', timeout: 3000 }).trim(); }
  catch { return 'unknown'; }
}
function runCapture() {
  const manifestFile = opt('--manifest');
  const outputDir = path.resolve(opt('--out'));
  if (!manifestFile || !opt('--out')) throw new Error('capture requires --manifest and --out');
  if (existsSync(outputDir)) throw new Error('Capture directory already exists; choose a fresh destination');
  const manifest = validateFieldManifest(readJSON(path.resolve(manifestFile)), has('--fixtures'));
  const selectedIDs = opt('--ids')?.split(',') ?? manifest.cases.map(c => c.id);
  if (!selectedIDs.length || new Set(selectedIDs).size !== selectedIDs.length ||
      selectedIDs.some(id => !manifest.cases.some(sample => sample.id === id))) throw new Error('Invalid --ids selection');
  const entries = [];
  const pkg = readJSON(path.join(root, 'package.json'));
  mkdirSync(outputDir, { recursive: true });
  for (const sample of manifest.cases.filter(c => selectedIDs.includes(c.id))) {
    const folder = path.join(outputDir, 'cases', sample.id);
    const imageDir = path.join(folder, 'screens');
    mkdirSync(imageDir, { recursive: true });
    const args = [path.join(root, 'bin', 'bronto-layout.mjs'), 'audit', '--url', fixtureURL(sample.url),
      '--width', String(sample.width), '--json', '--compact', '--ready-selector', 'body',
      '--settle', '500', '--timeout', '30000', '--evidence-dir', imageDir];
    if (sample.locale) args.push('--locale', sample.locale);
    if (has('--frame-inventory')) args.push('--frame-inventory');
    if (has('--full-page-evidence')) args.push('--full-page-evidence');
    const run = spawnSync(process.execPath, args, {
      cwd: root, encoding: 'utf8', timeout: 75000, maxBuffer: 12 * 1024 * 1024,
      env: process.env
    });
    let report;
    try { report = JSON.parse(run.stdout); } catch { report = undefined; }
    const screenshotFile = path.join(imageDir, `audit-${sample.width}px.png`);
    const screenshot = existsSync(screenshotFile) ? readFileSync(screenshotFile) : undefined;
    const expandedFile = path.join(imageDir, `audit-${sample.width}px-full.png`);
    const expanded = existsSync(expandedFile) ? readFileSync(expandedFile) : undefined;
    const expandedMeta = report?.reports?.[0]?.fullPageScreenshot;
    const pngMagic = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const fullPageRequested = has('--full-page-evidence');
    const expandedVerified = fullPageRequested && expanded?.subarray(0, 8).equals(pngMagic) === true &&
      path.resolve(expandedMeta?.file ?? '') === expandedFile &&
      Number.isInteger(expandedMeta?.capturedWidth) && Number.isInteger(expandedMeta?.capturedHeight) &&
      expandedMeta.capturedWidth > 0 && expandedMeta.capturedHeight > 0 &&
      expandedMeta.truncatedHorizontally !== undefined &&
      expandedMeta.truncatedVertically !== undefined;

    const actualHost = (() => {
      try { return new URL(report?.browser?.actualUrl).hostname; } catch { return null; }
    })();
    const expectedHost = sample.url.startsWith('examples/') ? null : new URL(sample.url).hostname;
    const trustedFinalLocation = expectedHost === null || actualHost === expectedHost;
    const complete = trustedFinalLocation && [0, 1].includes(run.status) && report?.mode === 'audit' &&
      report?.summary?.viewports === 1 && report?.reports?.[0]?.width === sample.width &&
      (report.reports[0].summary?.supportedScopeMeasured === true ||
        (report.reports[0].summary?.supportedScopeMeasured === undefined &&
          report.reports[0].summary?.verified === true)) &&
      screenshot?.subarray(0, 8).equals(pngMagic) === true &&
      (!fullPageRequested || expandedVerified);
    const auditRelative = `cases/${sample.id}/audit.json`;
    if (report) writeJSON(path.join(outputDir, auditRelative), report);
    const entry = {
      id: sample.id, url: sample.url, width: sample.width,
      ...(sample.locale ? { locale: sample.locale } : {}),
      complete: Boolean(complete), exitCode: run.status,
      contentCoverage: report?.reports?.[0]?.coverage?.status ??
        (report?.reports?.[0]?.coverage?.embeddedFrames > 0 ? 'known-uninspected-content' : 'unknown'),
      browserUserAgent: report?.browser?.userAgent ?? null,
      browserActualUrl: report?.browser?.actualUrl ?? null,
      auditFile: report ? auditRelative : null,
      auditSha256: report ? sha(readFileSync(path.join(outputDir, auditRelative))) : null,
      screenshotFile: screenshot ? `cases/${sample.id}/screens/audit-${sample.width}px.png` : null,
      screenshotSha256: screenshot ? sha(screenshot) : null,
      screenshotCoverage: screenshot ? 'viewport-only' : 'unavailable',
      ...(fullPageRequested ? {
        fullPageScreenshotFile: expanded ? `cases/${sample.id}/screens/audit-${sample.width}px-full.png` : null,
        fullPageScreenshotSha256: expanded ? sha(expanded) : null,
        fullPageEvidenceCoverage: expandedMeta?.coverage ?? 'unavailable',
        fullPageTruncated: expandedMeta ? Boolean(expandedMeta.truncatedVertically ||
          expandedMeta.truncatedHorizontally) : null,
        fullPageCapturedWidth: expandedMeta?.capturedWidth ?? null,
        fullPageCapturedHeight: expandedMeta?.capturedHeight ?? null,
        fullPageDocumentHeight: expandedMeta?.documentHeight ?? null
      } : {}),
      ...(complete ? {} : { error: run.error?.message || report?.error?.message ||
        (run.stderr || '').slice(-300) || 'Incomplete/failed browser capture' })
    };
    entries.push(entry);
    process.stderr.write(`${sample.id}: ${entry.complete ? 'complete' : 'incomplete'} (exit ${run.status})\n`);
  }
  const index = { schemaVersion: 1, datasetId: manifest.id, capturedAt: new Date().toISOString(),
    captureToolVersion: pkg.version, nodeVersion: process.version, sourceCommit: sourceVersion(),
    captureOptions: { frameInventory: has('--frame-inventory'), fullPageEvidence: has('--full-page-evidence') },
    allCaseIds: manifest.cases.map(c => c.id), captures: entries.length, cases: entries,
    limitations: ['Initial viewport screenshots alone do not show below-fold content; optional bounded page evidence is a separate static capture',
      'External page content and assets may change; this is one observed browser session',
      'No independent human labels are included in capture artifacts'] };
  writeJSON(path.join(outputDir, 'index.json'), index);
  process.stdout.write(JSON.stringify({ datasetId: index.datasetId, total: entries.length,
    complete: entries.filter(x => x.complete).length, index: path.join(outputDir, 'index.json') }, null, 2) + '\n');
  if (entries.some(row => !row.complete)) process.exitCode = 2;
}
/** Shared integrity-only data: never read a report's automatic detector findings. */
function fieldReviewEvidenceRows(index, captures) {
  if (index.schemaVersion !== 1 || !Array.isArray(index.cases) || index.cases.length > 60 ||
      typeof index.datasetId !== 'string') throw new Error('Invalid capture index');
  return index.cases.map(entry => {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(entry.id)) throw new Error('Invalid capture case id');
    let screenshotVerified = false, reportVerified = false;
    const fullExpected = index.captureOptions?.fullPageEvidence === true || Boolean(entry.fullPageScreenshotFile);
    let fullPageEvidenceVerified = !fullExpected;
    if (entry.screenshotFile && entry.screenshotSha256) {
      const screenshot = ensureInside(captures, entry.screenshotFile);
      if (existsSync(screenshot)) {
        const image = readFileSync(screenshot);
        screenshotVerified = validPNG(image) && sha(image) === entry.screenshotSha256;
      }
    }
    if (entry.auditFile && entry.auditSha256) {
      const report = ensureInside(captures, entry.auditFile);
      reportVerified = existsSync(report) && sha(readFileSync(report)) === entry.auditSha256;
    }
    if (fullExpected && entry.fullPageScreenshotFile && entry.fullPageScreenshotSha256) {
      const fullScreenshot = ensureInside(captures, entry.fullPageScreenshotFile);
      if (existsSync(fullScreenshot)) {
        const image = readFileSync(fullScreenshot);
        fullPageEvidenceVerified = validPNG(image) && sha(image) === entry.fullPageScreenshotSha256;
      }
    }
    return { id: entry.id, url: entry.url, width: entry.width, locale: entry.locale ?? null,
      screenshotFile: entry.screenshotFile ?? null,
      fullPageScreenshotFile: entry.fullPageScreenshotFile ?? null,
      fullPageEvidenceCoverage: entry.fullPageEvidenceCoverage ?? null,
      fullPageTruncated: entry.fullPageTruncated ?? null,
      screenshotVerified, reportVerified,
      fullPageEvidenceVerified: fullExpected ? fullPageEvidenceVerified : null,
      captureComplete: entry.complete === true,
      readyForReview: entry.complete === true && screenshotVerified && reportVerified && fullPageEvidenceVerified };
  });
}
/** Generate an unbiased HUMAN review worksheet: never seed expected labels from tool output. */
function runReviewPacket() {
  const dirName = opt('--captures');
  const outName = opt('--out');
  if (!dirName || !outName) throw new Error('review-packet requires --captures and --out');
  const captures = path.resolve(dirName);
  const destination = path.resolve(outName);
  if (existsSync(destination)) throw new Error('Review packet already exists; do not overwrite human notes');
  const index = readJSON(path.join(captures, 'index.json'));
  if (index.schemaVersion !== 1 || !Array.isArray(index.cases) ||
      typeof index.datasetId !== 'string') throw new Error('Invalid capture index');
  const items = fieldReviewEvidenceRows(index, captures);
  const lines = [
    '# Independent layout review — ' + index.datasetId, '',
    'This worksheet is **not** ground truth and contains **no generated defect labels**.',
    'Independently inspect the screenshot **and rendered page**, including below-fold/interactive states,',
    'before reading `audit.json` or Bronto Layout findings. Record intentional exceptions and unreviewable cases.', '',
    'Capture revision: `' + String(index.sourceCommit ?? 'unknown') + '`',
    'Capture time: `' + String(index.capturedAt ?? 'unknown') + '`',
    'Captured: ' + items.length + '; evidence verified for review: ' + items.filter(x=>x.readyForReview).length, '',
    'After review, enter **human-origin** case labels using `benchmarks/field-labels.template.json` and',
    '`docs/field-benchmark.md`; score them separately with `field-benchmark.mjs score`.', ''
  ];
  for (const item of items) {
    lines.push('## ' + item.id, '',
      '- Site: `' + String(item.url) + '`',
      '- Observed width: ' + item.width + ' CSS px' + (item.locale ? '; locale `' + item.locale + '`' : ''),
      '- Screenshot (relative to capture directory): `' + (item.screenshotFile ?? '(missing)') + '`',
      ...(item.fullPageEvidenceVerified !== null ? [
        '- Bounded below-fold image: `' + (item.fullPageScreenshotFile ?? '(missing)') + '`',
        '- Bounded image hash: ' + (item.fullPageEvidenceVerified ? 'verified' : 'FAILED / missing'),
        '- Bounded image coverage: ' + (item.fullPageEvidenceCoverage ?? 'unknown') +
          (item.fullPageTruncated ? ' (truncated — remaining content NOT captured)' : '')
      ] : []),
      '- Evidence integrity: **' + (item.readyForReview ? 'verified' : 'INCOMPLETE / UNSAFE TO SCORE') + '**',
      '- [ ] Independently review actual rendered viewport, scroll area and relevant interaction states',
      '- [ ] Record positive defects, known intentional exceptions and element locations',
      '- [ ] Record limitations or mark unreviewable; do not infer clean from tool silence',
      '- [ ] Record reviewer identity, review date and rationale in separate labels file', '');
  }
  mkdirSync(path.dirname(destination), {recursive:true});
  writeFileSync(destination, lines.join('\n'), {flag:'wx'});
  const result = {schemaVersion:1,mode:'field-review-packet',datasetId:index.datasetId,
    output:destination, total:items.length, readyForReview:items.filter(x=>x.readyForReview).length,
    pendingHumanLabels:items.length, cases:items};
  if (has('--json')) console.log(JSON.stringify(result,null,2));
  else console.log('Created independent-review worksheet for '+items.length+' cases ('+result.readyForReview+' verified); no labels inferred: '+destination);
}

/** Produce a static HTML image gallery; cannot generate human labels. */
function runReviewGallery() {
  const dirName = opt('--captures');
  const outName = opt('--out');
  if (!dirName || !outName) throw new Error('review-gallery requires --captures and --out');
  const captures = path.resolve(dirName), destination = path.resolve(outName);
  if (existsSync(destination)) throw new Error('Review gallery already exists; do not overwrite reviewer work');
  const index = readJSON(path.join(captures, 'index.json'));
  const rows = fieldReviewEvidenceRows(index, captures);
  const html = renderFieldReviewGallery(index, rows, captures, destination);
  mkdirSync(path.dirname(destination), {recursive:true});
  writeFileSync(destination, html, {flag:'wx'});
  const result={schemaVersion:1,mode:'field-review-gallery',datasetId:index.datasetId,
    output:destination,total:rows.length,readyForReview:rows.filter(row=>row.readyForReview).length,
    pendingHumanLabels:rows.length,includesDetectorPredictions:false};
  if (has('--json')) process.stdout.write(JSON.stringify(result,null,2)+'\n');
  else process.stdout.write('Created offline independent-review contact sheet: '+destination+' ('+
    result.readyForReview+'/'+result.total+' hash-verified; no labels inferred)\n');
}

/** Optional browser-editable offline reviewer form; unlike the script-free gallery,
 * it uses a CSP-hash-locked inline script for user-triggered JSON downloads.
 */
function runReviewConsole() {
  const dirName = opt('--captures');
  const outName = opt('--out');
  if (!dirName || !outName) throw new Error('review-console requires --captures and --out');
  const captures = path.resolve(dirName);
  const destination = path.resolve(outName);
  if (existsSync(destination)) throw new Error('Review console already exists; do not overwrite human work');
  const index = readJSON(path.join(captures,'index.json'));
  const rows = fieldReviewEvidenceRows(index,captures);
  const html=renderFieldReviewConsole(index,rows,captures,destination);
  mkdirSync(path.dirname(destination),{recursive:true});
  writeFileSync(destination,html,{flag:'wx'});
  const result={schemaVersion:1,mode:'field-review-console',datasetId:index.datasetId,
    output:destination,total:rows.length,readyForReview:rows.filter(row=>row.readyForReview).length,
    initialPending:rows.length,humanLabels:0,includesDetectorPredictions:false,
    outboundNetworkEnabled:false};
  if (has('--json')) process.stdout.write(JSON.stringify(result,null,2)+'\n');
  else process.stdout.write('Created offline human review console: '+destination+' ('+
    result.readyForReview+'/'+result.total+' hash-verified; no labels or predictions generated).\n');
}

/** Create an editable, deliberately unscorable BLANK ground-truth worksheet.
 * No predictions or default negative labels are copied from audit evidence.
 */
function runReviewLabelTemplate() {
  const captureName = opt('--captures');
  const outName = opt('--out');
  if (!captureName || !outName) throw new Error('review-label-template requires --captures and --out');
  const captures = path.resolve(captureName);
  const destination = path.resolve(outName);
  if (existsSync(destination)) throw new Error('Review label template already exists; do not overwrite human work');
  const index = readJSON(path.join(captures, 'index.json'));
  const rows = fieldReviewEvidenceRows(index, captures);
  if (new Set(rows.map(item => item.id)).size !== rows.length)
    throw new Error('Duplicate case IDs in evidence index');
  const labels = {
    schemaVersion: 1,
    datasetId: index.datasetId,
    reviewProtocol: FIELD_REVIEW_PROTOCOL,
    cases: rows.map(row => ({ id: row.id, reviewStatus: 'pending' }))
  };
  // Validate early, but intentionally preserve pending entries as unscored.
  validateFieldLabels(labels, index.datasetId, rows.map(item => item.id));
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, JSON.stringify(labels, null, 2) + '\n', { flag: 'wx' });
  const result = { schemaVersion: 1, mode: 'field-review-label-template', datasetId: index.datasetId,
    output: destination, cases: rows.length, pending: rows.length,
    readyForHumanReview: rows.filter(row => row.readyForReview).length,
    humanLabels: 0, detectorPredictionsIncluded: false };
  if (has('--json')) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else process.stdout.write('Created unreviewed label draft: ' + destination + ' (' +
    rows.length + ' pending, 0 human labels; no detector predictions).\n');
}

/** Human-review progress is separate from detector scoring and never opens audit reports. */
function runReviewProgress() {
  const captureName = opt('--captures');
  const labelName = opt('--labels');
  if (!captureName || !labelName) throw new Error('review-progress requires --captures and --labels');
  const captures = path.resolve(captureName);
  const index = readJSON(path.join(captures, 'index.json'));
  const rows = fieldReviewEvidenceRows(index, captures);
  const labels = readJSON(path.resolve(labelName));
  validateFieldLabels(labels, index.datasetId, rows.map(item => item.id));
  const byId = new Map(labels.cases.map(item => [item.id, item]));
  const pending = [], reviewed = [], unreviewable = [], unsafe = [];
  for (const row of rows) {
    const label = byId.get(row.id);
    if (!label || label.reviewStatus === 'pending') pending.push(row.id);
    else if (label.reviewStatus === 'reviewed') reviewed.push(row.id);
    else unreviewable.push(row.id);
    if (!row.readyForReview) unsafe.push(row.id);
  }
  const result = { schemaVersion: 1, mode: 'field-review-progress', datasetId: index.datasetId,
    total: rows.length, pending, reviewed, unreviewable,
    evidenceUnsafe: unsafe, detectorPredictionsIncluded: false,
    limitations: [
      'Review status reflects reviewer declarations, never tool-confirmed human inspection',
      'This command reads capture metadata and hashes but never detector findings or labels them',
      'Use score only after independently supplying complete human-reviewed labels; frame coverage gaps are excluded from whole-page scoring'
    ] };
  if (has('--json')) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else process.stdout.write('Human review progress: ' + reviewed.length + '/' + rows.length +
    ' reviewed; ' + pending.length + ' pending; ' + unreviewable.length +
    ' unreviewable; ' + unsafe.length + ' evidence-unsafe. No accuracy scored.\n');
}

function runScore() {
  const captures = path.resolve(opt('--captures'));
  const labelPath = opt('--labels');
  if (!labelPath || !opt('--captures')) throw new Error('score requires --captures and --labels');
  const index = readJSON(path.join(captures, 'index.json'));
  const labels = readJSON(path.resolve(labelPath));
  const evidence = {};
  for (const sample of index.cases) {
    sample.screenshotVerified = false;
    if (!sample.auditFile || !sample.screenshotFile) continue;
    const auditPath = ensureInside(captures, sample.auditFile);
    const imagePath = ensureInside(captures, sample.screenshotFile);
    if (!existsSync(auditPath) || !existsSync(imagePath)) continue;
    const auditBytes = readFileSync(auditPath);
    const viewportBytes = readFileSync(imagePath);
    if (sha(auditBytes) !== sample.auditSha256 || !validPNG(viewportBytes) ||
        sha(viewportBytes) !== sample.screenshotSha256) continue;
    const fullExpected = index.captureOptions?.fullPageEvidence === true || Boolean(sample.fullPageScreenshotFile);
    if (fullExpected) {
      if (!sample.fullPageScreenshotFile || !sample.fullPageScreenshotSha256) continue;
      const full = ensureInside(captures, sample.fullPageScreenshotFile);
      if (!existsSync(full)) continue;
      const fullBytes = readFileSync(full);
      if (!validPNG(fullBytes) || sha(fullBytes) !== sample.fullPageScreenshotSha256) continue;
    }
    evidence[sample.id] = readJSON(auditPath);
    sample.screenshotVerified = true;
  }
  const result = scoreFieldEvidence(index, labels, evidence);
  const missingCaptures = (index.allCaseIds || []).filter(id => !index.cases.some(c => c.id === id));
  result.pending.push(...missingCaptures);
  result.totalManifestCases = index.allCaseIds?.length ?? index.cases.length;
  if (opt('--report')) writeJSON(path.resolve(opt('--report')), result);
  if (has('--json')) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else process.stdout.write(
    `Field benchmark ${result.datasetId}: ${result.metrics.evaluatedCases} evaluated, ` +
    `${result.metrics.matchingCases} matches; ${result.pending.length} pending, ` +
    `${result.metrics.incompleteCases} incomplete, ${result.unreviewable.length} unreviewable\n` +
    `Measured precision ${result.metrics.measured.precision ?? 'N/A'}, recall ${result.metrics.measured.recall ?? 'N/A'}\n` +
    `Review precision ${result.metrics.review.precision ?? 'N/A'}, recall ${result.metrics.review.recall ?? 'N/A'}\n`);
  if (result.metrics.incompleteCases || (has('--assert') && result.pending.length)) process.exitCode = 2;
  else if (has('--assert') && result.metrics.matchingCases !== result.metrics.evaluatedCases) process.exitCode = 1;
}
try {
  assertKnownOptions();
  if (has('--frame-inventory') && action !== 'capture')
    throw new Error('--frame-inventory applies only to capture');
  if (has('--full-page-evidence') && action !== 'capture')
    throw new Error('--full-page-evidence applies only to capture');
  if (has('--help') || action === '--help' || action === undefined) console.log(usage());
  else if (action === 'validate') {
    const manifest = opt('--manifest');
    if (!manifest) throw new Error('validate requires --manifest FILE');
    const result = validateFieldManifest(readJSON(path.resolve(manifest)), has('--fixtures'));
    console.log(`Valid field benchmark: ${result.id}, ${result.cases.length} cases; no labels inferred`);
  } else if (action === 'capture') runCapture();
  else if (action === 'score') runScore();
  else if (action === 'review-packet') runReviewPacket();
  else if (action === 'review-gallery') runReviewGallery();
  else if (action === 'review-console') runReviewConsole();
  else if (action === 'review-label-template') runReviewLabelTemplate();
  else if (action === 'review-progress') runReviewProgress();
  else throw new Error('Choose validate, capture, review-packet, review-gallery, review-console, review-label-template, review-progress or score. Run --help.');
} catch (error) {
  console.error('Field benchmark: ' + (error?.message || String(error)));
  process.exitCode = 2;
}
