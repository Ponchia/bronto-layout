/**
 * Fixed public first-party cohort; output is deliberately limited to numbers,
 * static case IDs and approved rule IDs. Do not include page contents, DOM paths,
 * CSS values, URLs from runtime output, or raw browser reports in artifacts.
 */
export const TARGETS = Object.freeze([
  {id: 'personal-site', file: 'personal-site.json', url: 'https://brontolotto.observer/'},
  {id: 'sense6-gallery', file: 'sense6-gallery.json', url: 'https://sense6.net/en/'},
  {id: 'sense6-ar', file: 'sense6-ar.json', url: 'https://sense6.net/ar/', locale: 'ar'},
  {id: 'sense6-learn', file: 'sense6-learn.json', url: 'https://sense6.net/en/learn/'},
  {id: 'brontoui-home', file: 'brontoui-home.json', url: 'https://ponchia.github.io/bronto-ui/'},
  {id: 'brontoui-operations', file: 'brontoui-operations.json', url: 'https://ponchia.github.io/bronto-ui/examples/operations/'}
]);

export const EXPECTED_WIDTHS = Object.freeze([320, 348, 375, 572, 768, 1024, 1280]);
const safeCode = value => typeof value === 'string' && /^[A-Z][A-Z_]{0,63}$/.test(value) ? value : 'UNVERIFIED';
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(value) ? value : '(unprintable)';
const count = value => Number.isSafeInteger(value) && value >= 0;
const safeWidth = value => Number.isSafeInteger(value) && value >= 200 && value <= 10000 ? value : null;
const safeDeviation = value => Number.isFinite(value) && value >= 0 && value <= 100000
  ? Math.round(value * 100) / 100 : null;

export function verifyTargetSpec(target, source) {
  if (!TARGETS.includes(target)) throw new Error('Unknown first-party target');
  if (!source || typeof source !== 'object' || source.schemaVersion !== 1 || source.url !== target.url ||
      !Array.isArray(source.widths) || source.widths.join(',') !== '320,375,768,1280' ||
      !Array.isArray(source.rules) || source.rules.length < 1) {
    throw new Error(`Refusing unexpected public URL, widths or missing contract for ${target.id}`);
  }
}

/** All returned fields are suitable for public CI metadata. Raw messages are never forwarded. */
export function summarizeTarget(target, exit, report, elapsedMs) {
  if (!TARGETS.includes(target)) throw new Error('Unknown first-party target');
  if (!count(elapsedMs)) throw new Error('Invalid duration');
  const base = {id: target.id, elapsedMs};
  const unverified = code => ({...base, status: 'unverified', code: safeCode(code),
    checkedWidths: 0, passed: 0, failed: 0, skipped: 0, maxUntestedGapPx: null, ruleIds: [], findings: []});
  if (exit === 2) return unverified(report?.error?.code);
  if (exit !== 0 && exit !== 1) return unverified('CLI_PROCESS_ERROR');
  if (report?.schemaVersion !== 1 || report.mode !== 'check' || report.format !== 'compact')
    return unverified('UNEXPECTED_REPORT');
  const summary = report.summary;
  if (!count(summary?.passed) || !count(summary?.failed) || !count(summary?.skipped) ||
      summary.passed + summary.failed + summary.skipped === 0)
    return unverified('INVALID_COUNTS');
  if (!Array.isArray(report.sampledWidths) || report.sampledWidths.join(',') !== EXPECTED_WIDTHS.join(',') ||
      report.sampling?.interiorProbes !== 1 || report.sampling?.largestUntestedGapPx !== 255)
    return unverified('INCOMPLETE_WIDTH_COVERAGE');
  if (!Array.isArray(report.failures) || !Array.isArray(report.unmeasurable) ||
      !count(report.omittedFailures) || !count(report.omittedUnmeasurable))
    return unverified('MISSING_FAILURE_EVIDENCE');
  if (report.unmeasurable.length + report.omittedUnmeasurable > 0)
    return unverified('UNMEASURABLE_RULES');
  if ((exit === 0 && summary.failed > 0) || (exit === 1 && summary.failed === 0) ||
      (summary.failed > 0 && report.failures.length === 0))
    return unverified('CONTRADICTORY_EXIT');
  return {...base, status: exit === 0 ? 'pass' : 'violation', code: null,
    checkedWidths: report.sampledWidths.length, passed: summary.passed, failed: summary.failed,
    skipped: summary.skipped, maxUntestedGapPx: report.sampling.largestUntestedGapPx,
    ruleIds: [...new Set(report.failures.slice(0, 6).map(f => safeId(f.id)))],
    findings: report.failures.slice(0, 6).map(f => ({id: safeId(f.id),
      width: safeWidth(f.width), deviation: safeDeviation(f.deviation)})),
    omittedRuleIds: report.omittedFailures};
}

export function pulseSummary(rows) {
  if (!Array.isArray(rows) || rows.length !== TARGETS.length ||
      rows.some((row, index) => row?.id !== TARGETS[index].id ||
        !['pass','violation','unverified'].includes(row.status)))
    throw new Error('Weekly pulse must inspect exactly the fixed six-case cohort in order');
  return {schemaVersion: 1, kind: 'first-party-layout-pulse',
    targetCount: rows.length, passing: rows.filter(r => r.status === 'pass').length,
    violations: rows.filter(r => r.status === 'violation').length,
    unverified: rows.filter(r => r.status === 'unverified').length,
    totalElapsedMs: rows.reduce((n, r) => n + r.elapsedMs, 0), cases: rows};
}

export function pulseMarkdown(summary) {
  const gap = value => value === null || value === undefined ? '—' : `${value} px`;
  const lines = [
    '## Bronto Layout — weekly first-party contracts',
    '',
    `**${summary.passing}/${summary.targetCount} passing** · ${summary.violations} violations · ${summary.unverified} unverified`,
    '',
    '| Owned public route | Status | Widths | Passed | Failed | Skipped | Largest gap | Findings / reason |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const r of summary.cases) {
    const detail = r.status === 'unverified' ? r.code :
      r.status === 'violation' ? (r.findings.slice(0, 3).map(f =>
        `${f.id}${f.width === null ? '' : '@' + f.width + 'px'}`).join(', ') || 'Unreported rule') : '—';
    lines.push(`| ${r.id} | ${r.status} | ${r.checkedWidths} | ${r.passed} | ${r.failed} | ${r.skipped} | ${gap(r.maxUntestedGapPx)} | ${detail} |`);
  }
  lines.push('', 'A passing contract covers **only the recorded widths and browser state**. Unverified measurements and unsupported DOM/CSP content are not passing results. Raw DOM evidence, CSS, page contents, screenshots and authentication data are not exported.', '');
  return lines.join('\n');
}
