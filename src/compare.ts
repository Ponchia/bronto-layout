import type { FindingStatus, LayoutFinding, LayoutReport } from './core.js';

/** A regression means a verified rule became violated or its violation substantially worsened.
 *  Missing measurements are never presented as a verified improvement or regression.
 */
export type ChangeKind = 'regression' | 'improvement' | 'unchanged' | 'unverified';
export interface RuleChange {
  width: number;
  ruleId: string;
  type: LayoutFinding['type'];
  baselineStatus: FindingStatus;
  candidateStatus: FindingStatus;
  baselineDeviation?: number;
  candidateDeviation?: number;
  baselineMessage: string;
  candidateMessage: string;
  kind: ChangeKind;
  /** Difference in out-of-tolerance error (candidate minus baseline), if measurable. */
  errorDelta?: number;
  errorUnit?: 'px' | '%' | 'elements' | 'score';
}
export interface ComparisonSummary {
  regressions: number;
  improvements: number;
  unchanged: number;
  unverified: number;
  baselineFailures: number;
  candidateFailures: number;
}
export interface LayoutComparison {
  schemaVersion: 1;
  mode: 'compare';
  baselineUrl: string;
  candidateUrl: string;
  summary: ComparisonSummary;
  changes: RuleChange[];
  baseline: LayoutReport[];
  candidate: LayoutReport[];
}
const statusError = (finding: LayoutFinding): number | undefined =>
  Number.isFinite(finding.deviation) ? Math.max(0, finding.deviation! - (finding.tolerance ?? 0)) : undefined;

export function compareReports(
  baselineUrl: string,
  candidateUrl: string,
  baseline: readonly LayoutReport[],
  candidate: readonly LayoutReport[],
  /** Ignore changes in measured error smaller than this many CSS pixels. */
  significantDelta = 1
): LayoutComparison {
  if (!(Number.isFinite(significantDelta) && significantDelta >= 0)) throw new Error('significantDelta must be nonnegative');
  const baselineByWidth = new Map(baseline.map(r => [r.viewport.width, r]));
  const candidateByWidth = new Map(candidate.map(r => [r.viewport.width, r]));
  if (!baseline.length || baselineByWidth.size !== baseline.length || candidateByWidth.size !== candidate.length ||
      baselineByWidth.size !== candidateByWidth.size || [...baselineByWidth.keys()].some(width => !candidateByWidth.has(width))) {
    throw new Error('Baseline and candidate must use the same unique viewport widths (at least one viewport required)');
  }
  const summary: ComparisonSummary = {
    regressions: 0, improvements: 0, unchanged: 0, unverified: 0, baselineFailures: 0, candidateFailures: 0
  };
  const changes: RuleChange[] = [];
  for (const width of [...baselineByWidth.keys()].sort((a, b) => a - b)) {
    const a = baselineByWidth.get(width)!;
    const b = candidateByWidth.get(width)!;
    const baselineByRule = new Map(a.findings.map(f => [f.id, f]));
    const candidateByRule = new Map(b.findings.map(f => [f.id, f]));
    if (baselineByRule.size !== a.findings.length || candidateByRule.size !== b.findings.length ||
      baselineByRule.size !== candidateByRule.size || [...baselineByRule.keys()].some(key => !candidateByRule.has(key))) {
      throw new Error(`Different contract rule IDs at ${width}px; comparisons must use the same rules`);
    }
    for (const [ruleId, before] of baselineByRule) {
      const after = candidateByRule.get(ruleId)!;
      if (before.type !== after.type) throw new Error(`Rule type changed for ${ruleId} at ${width}px`);
      if (before.status === 'fail') summary.baselineFailures++;
      if (after.status === 'fail') summary.candidateFailures++;
      const errorBefore = statusError(before);
      const errorAfter = statusError(after);
      const errorDelta = errorBefore !== undefined && errorAfter !== undefined ? errorAfter - errorBefore : undefined;
      let kind: ChangeKind = 'unchanged';
      if (before.status === 'skip' || after.status === 'skip') {
        // Two intentional width exclusions agree; two missing measurements
        // establish nothing about whether the relationship changed.
        kind = before.status === after.status && before.code === 'outside-width-range' &&
          after.code === 'outside-width-range' ? 'unchanged' : 'unverified';
      } else if (before.status === 'pass' && after.status === 'fail') {
        kind = 'regression';
      } else if (before.status === 'fail' && after.status === 'pass') {
        kind = 'improvement';
      } else if (before.status === 'fail' && after.status === 'fail' && errorDelta !== undefined) {
        // One CSS pixel is not a meaningful threshold for unitless shift scores.
        // Worsening/improving lab shifts get a smaller score-specific floor.
        const threshold = before.type === 'layout-stability' ? 0.005 : significantDelta;
        if (errorDelta > threshold) kind = 'regression';
        else if (errorDelta < -threshold) kind = 'improvement';
      }
      const change: RuleChange = {
        width, ruleId, type: before.type,
        baselineStatus: before.status, candidateStatus: after.status,
        baselineMessage: before.message, candidateMessage: after.message, kind,
        ...(before.deviation !== undefined ? { baselineDeviation: before.deviation } : {}),
        ...(after.deviation !== undefined ? { candidateDeviation: after.deviation } : {}),
        ...(errorDelta !== undefined ? { errorDelta, errorUnit: before.type === 'layout-stability' ? 'score' : before.type === 'image-aspect' ? '%' : before.type === 'selector-count' ? 'elements' : 'px' } : {})
      };
      changes.push(change);
      if (kind === 'regression') summary.regressions++;
      else if (kind === 'improvement') summary.improvements++;
      else if (kind === 'unverified') summary.unverified++;
      else summary.unchanged++;
    }
  }
  return {
    schemaVersion: 1, mode: 'compare', baselineUrl, candidateUrl, summary, changes,
    baseline: [...baseline], candidate: [...candidate]
  };
}
