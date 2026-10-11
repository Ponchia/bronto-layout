import type { LayoutFinding, LayoutReport } from './core.js';
import type { LayoutComparison } from './compare.js';
import type { RuleTransition } from './sweep.js';
import type { CSSFailureSourceLead } from './css-failure-leads.js';

/** A bounded output shape for coding agents. It never asserts correctness at untested widths. */
const compactShifts = (reports: readonly LayoutReport[]) => reports
  .filter(report => report.layoutShifts)
  .map(report => {
    const shifts = report.layoutShifts!;
    return {
      width: report.viewport.width,
      supported: shifts.supported,
      ...(shifts.reason ? { reason: shifts.reason } : {}),
      maxSessionScore: shifts.maxSessionScore,
      totalScore: shifts.totalScore,
      shiftCount: shifts.shiftCount,
      ignoredInputCount: shifts.ignoredInputCount,
      droppedEvents: shifts.droppedEvents,
      topEvents: [...shifts.events].filter(event => !event.hadRecentInput)
        .sort((a, b) => b.value - a.value).slice(0, 3)
        .map(event => ({
          time: event.startTime, value: event.value,
          sources: event.sources.slice(0, 2)
        }))
    };
  });

const MAX_ITEMS = 100;
const bounded = <T>(items: readonly T[]) => ({
  values: items.slice(0, MAX_ITEMS),
  omitted: Math.max(0, items.length - MAX_ITEMS)
});

function compactFinding(finding: LayoutFinding, width: number) {
  return {
    width,
    id: finding.id,
    type: finding.type,
    status: finding.status,
    ...(finding.code ? { code: finding.code } : {}),
    message: finding.message,
    ...(finding.deviation !== undefined ? { deviation: finding.deviation } : {}),
    ...(finding.tolerance !== undefined ? { tolerance: finding.tolerance } : {}),
    ...(finding.paths?.length ? { paths: finding.paths.slice(0, 6) } : {}),
    ...(finding.evidence?.length ? { evidence: finding.evidence.slice(0, 4) } : {}),
    ...(finding.overflowCandidates?.length
      ? { overflowCandidates: finding.overflowCandidates.slice(0, 4) } : {})
  };
}

interface CheckData {
  url: string;
  reports: LayoutReport[];
  summary: { passed: number; failed: number; skipped: number };
  transitions: RuleTransition[];
  cssBreakpointScan?: { thresholds: number[]; widths: number[]; addedWidths: number[] };
  cssSourceLeads?: CSSFailureSourceLead[];
  omittedCSSSourceWidths?: number;
  evidence?: { width: number; screenshot: string }[];
}

/** Omits successful assertions, while retaining precise evidence for every retained violation. */
export function compactCheckReport(result: CheckData) {
  const failed = result.reports.flatMap(report => report.findings
    .filter(f => f.status === 'fail')
    .map(f => compactFinding(f, report.viewport.width)));
  const unmeasured = result.reports.flatMap(report => report.findings
    .filter(f => f.status === 'skip' && f.code === 'measurement-unavailable')
    .map(f => compactFinding(f, report.viewport.width)));
  const failures = bounded(failed);
  const unmeasurable = bounded(unmeasured);
  return {
    schemaVersion: 1 as const, mode: 'check' as const, format: 'compact' as const,
    url: result.url,
    summary: result.summary,
    sampledWidths: result.reports.map(r => r.viewport.width),
    ...(result.reports.some(r => r.stabilization) ? { stabilization: result.reports
      .filter(r => r.stabilization).map(r => ({ width: r.viewport.width, ...r.stabilization })) } : {}),
    ...(result.reports.some(r => r.layoutShifts) ? { layoutShifts: compactShifts(result.reports) } : {}),
    failures: failures.values,
    omittedFailures: failures.omitted,
    unmeasurable: unmeasurable.values,
    omittedUnmeasurable: unmeasurable.omitted,
    transitions: result.transitions,
    ...(result.cssBreakpointScan ? { cssBreakpointScan: result.cssBreakpointScan } : {}),
    ...(result.cssSourceLeads ? { cssSourceLeads: result.cssSourceLeads, omittedCSSSourceWidths: result.omittedCSSSourceWidths ?? 0 } : {}),
    ...(result.evidence ? { evidence: result.evidence } : {})
  };
}

/** A comparison reports existing candidate problems separately from new regressions. */
export function compactCompareReport(result: LayoutComparison & {
  cssBreakpointScan?: { thresholds: number[]; widths: number[]; addedWidths: number[] };
  evidence?: { width: number; screenshot: string }[];
}) {
  const changes = bounded(result.changes.filter(c => c.kind !== 'unchanged'));
  const remaining = bounded(result.candidate.flatMap(report => report.findings
    .filter(f => f.status === 'fail')
    .map(f => compactFinding(f, report.viewport.width))));
  return {
    schemaVersion: 1 as const, mode: 'compare' as const, format: 'compact' as const,
    baselineUrl: result.baselineUrl,
    candidateUrl: result.candidateUrl,
    summary: result.summary,
    sampledWidths: result.candidate.map(r => r.viewport.width),
    ...(result.candidate.some(r => r.stabilization) ? { stabilization: {
      baseline: result.baseline.filter(r => r.stabilization)
        .map(r => ({ width: r.viewport.width, ...r.stabilization })),
      candidate: result.candidate.filter(r => r.stabilization)
        .map(r => ({ width: r.viewport.width, ...r.stabilization }))
    } } : {}),
    ...(result.candidate.some(r => r.layoutShifts) ? { layoutShifts: {
      baseline: compactShifts(result.baseline), candidate: compactShifts(result.candidate) } } : {}),
    changes: changes.values,
    omittedChanges: changes.omitted,
    remainingFailures: remaining.values,
    omittedRemainingFailures: remaining.omitted,
    ...(result.cssBreakpointScan ? { cssBreakpointScan: result.cssBreakpointScan } : {}),
    ...(result.evidence ? { evidence: result.evidence } : {})
  };
}
