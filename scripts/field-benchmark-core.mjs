/** Field benchmark schemas and scoring. Ground truth must come from a separate
 * human review of the raw page/screenshot, never copied from detector output.
 */
import { KNOWN_DETECTORS, scoreLabeledAuditCases } from './audit-benchmark-metrics.mjs';
const ident = x => typeof x === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(x);
const unique = list => new Set(list).size === list.length;
function assert(condition, message) { if (!condition) throw new Error('Field benchmark: ' + message); }
function codes(value, kind) {
  assert(Array.isArray(value) && unique(value) && value.every(code =>
    KNOWN_DETECTORS[kind].includes(code)), 'invalid ' + kind + ' labels');
}
export function validateFieldManifest(data, fixturesAllowed = false) {
  assert(data?.schemaVersion === 1 && ident(data.id) &&
    Array.isArray(data.cases) && data.cases.length >= 1 && data.cases.length <= 60,
    'manifest requires schemaVersion 1, id and 1..60 cases');
  assert(Array.isArray(data.allowedHosts) && data.allowedHosts.every(host =>
    typeof host === 'string' && /^[a-z0-9.-]+$/.test(host)), 'allowedHosts required');
  const seen = [];
  for (const sample of data.cases) {
    assert(ident(sample?.id) && !seen.includes(sample.id), 'invalid or duplicate case ID');
    seen.push(sample.id);
    assert(Number.isInteger(sample.width) && sample.width >= 200 && sample.width <= 10000,
      sample.id + ': invalid width');
    assert(sample.locale === undefined || /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/i.test(sample.locale),
      sample.id + ': invalid locale');
    assert(typeof sample.url === 'string', sample.id + ': URL required');
    if (sample.url.startsWith('examples/')) {
      assert(fixturesAllowed && /^examples\/[a-z0-9_.-]+\.html$/i.test(sample.url),
        sample.id + ': local fixtures require explicit --fixtures test mode');
    } else {
      let target;
      try { target = new URL(sample.url); } catch { /* Checked below. */ }
      assert(target && target.protocol === 'https:' && !target.username && !target.password &&
        !target.search && !target.hash && data.allowedHosts.includes(target.hostname),
        sample.id + ': only allowlisted HTTPS URLs without credentials or query tokens');
    }
  }
  return data;
}
export function validateFieldLabels(data, datasetId, knownIds) {
  assert(data?.schemaVersion === 1 && data.datasetId === datasetId &&
    typeof data.reviewProtocol === 'string' && data.reviewProtocol.length >= 20 &&
    Array.isArray(data.cases), 'labels must name dataset and independent review protocol');
  const seen = [];
  for (const label of data.cases) {
    assert(ident(label?.id) && knownIds.includes(label.id) && !seen.includes(label.id),
      'unknown or duplicated label case');
    seen.push(label.id);
    assert(['reviewed', 'unreviewable'].includes(label.reviewStatus),
      label.id + ': reviewStatus must be reviewed or unreviewable');
    assert(typeof label.reviewer === 'string' && label.reviewer.trim().length >= 3 &&
      typeof label.reviewedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(label.reviewedAt) &&
      Number.isFinite(Date.parse(label.reviewedAt)), label.id + ': human reviewer and review date required');
    assert(typeof label.rationale === 'string' && label.rationale.trim().length >= 15,
      label.id + ': explain evidence and independent judgment');
    if (label.reviewStatus === 'reviewed') {
      assert(label.reviewedScreenshot === true && label.reviewedRenderedPage === true,
        label.id + ': attest to screenshot and rendered-page review');
      codes(label.expectedMeasured, 'measured'); codes(label.expectedReview, 'review');
    } else {
      assert(label.expectedMeasured === undefined && label.expectedReview === undefined,
        label.id + ': unreviewable cases have no presumed negatives');
    }
  }
  return data;
}
export function scoreFieldEvidence(index, labels, evidenceById) {
  assert(index?.schemaVersion === 1 && ident(index.datasetId) && Array.isArray(index.cases),
    'invalid capture index');
  const ids = index.cases.map(x => x.id);
  assert(ids.every(ident) && unique(ids), 'duplicate or invalid capture case IDs');
  if (index.allCaseIds !== undefined) {
    assert(Array.isArray(index.allCaseIds) && unique(index.allCaseIds) &&
      ids.every(id => index.allCaseIds.includes(id)), 'invalid capture cohort IDs');
  }
  validateFieldLabels(labels, index.datasetId, ids);
  const labeled = new Map(labels.cases.map(row => [row.id, row]));
  const pending = [], unreviewable = [], rows = [];
  for (const sample of index.cases) {
    const label = labeled.get(sample.id);
    if (!label) { pending.push(sample.id); continue; }
    if (label.reviewStatus === 'unreviewable') { unreviewable.push(sample.id); continue; }
    const report = evidenceById[sample.id];
    const view = report?.reports?.[0];
    const complete = sample.complete === true && sample.screenshotVerified === true &&
      report?.mode === 'audit' && report?.summary?.viewports === 1 &&
      view?.width === sample.width && view?.summary?.verified === true &&
      Array.isArray(view.findings) && view.coverage?.truncated === false;
    rows.push({ id: sample.id, complete, error: complete ? undefined : 'Incomplete or tampered browser evidence',
      expectedMeasured: label.expectedMeasured, expectedReview: label.expectedReview,
      observedMeasured: complete ? [...new Set(view.findings.filter(f => f.classification === 'measured').map(f => f.code))] : [],
      observedReview: complete ? [...new Set(view.findings.filter(f => f.classification === 'review').map(f => f.code))] : [] });
  }
  assert(rows.length > 0, 'no independently reviewed cases to score');
  return {
    schemaVersion: 1, mode: 'field-benchmark', datasetId: index.datasetId,
    reviewProtocol: labels.reviewProtocol,
    totalCases: index.cases.length, labeledCases: rows.length,
    pending, unreviewable, metrics: scoreLabeledAuditCases(rows),
    limitations: [
      'Accuracy applies only to these named, independently reviewed page states',
      'Detector-code/viewport classification is not pixel-level visual quality',
      'A screenshot covers only the initial browser viewport; reviewers must inspect below-fold content separately',
      'Browser, network and rendered content may differ on later visits',
      'No cross-tool superiority or WCAG conformance claim'
    ]
  };
}
