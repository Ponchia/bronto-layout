import type { FindingStatus, LayoutReport } from './core.js';

/**
 * Responsive sampling + optional refinement of observed status transitions.
 * Not a proof of correctness between all samples: narrow islands can be missed.
 */
export interface RuleTransition {
  ruleId: string;
  previousWidth: number;
  width: number;
  from: FindingStatus;
  to: FindingStatus;
  precision: 'one-pixel' | 'sampled';
}
export interface SweepResult { reports: LayoutReport[]; transitions: RuleTransition[] }
function signature(report: LayoutReport): string {
  return report.findings.map(f => `${f.id}:${f.status}`).join('|');
}
export async function sweepLayout(
  widths: readonly number[],
  check: (width: number) => Promise<LayoutReport>,
  refine = false,
  maxSamples = 200
): Promise<SweepResult> {
  if (widths.length < 1) throw new Error('At least one viewport width is required');
  const results = new Map<number, LayoutReport>();
  const sample = async (width: number) => {
    const saved = results.get(width);
    if (saved) return saved;
    if (results.size >= maxSamples) throw new Error(`Viewport scan exceeded ${maxSamples} samples; increase step or shorten range`);
    const value = await check(width);
    results.set(width, value);
    return value;
  };
  const sorted = [...new Set(widths)].sort((a, b) => a - b);
  for (const width of sorted) await sample(width);
  if (refine) {
    const refineBetween = async (lo: number, hi: number): Promise<void> => {
      if (hi - lo <= 1) return;
      const left = results.get(lo)!;
      const right = results.get(hi)!;
      if (signature(left) === signature(right)) return;
      const mid = Math.floor((lo + hi) / 2);
      await sample(mid);
      await refineBetween(lo, mid);
      await refineBetween(mid, hi);
    };
    for (let i = 1; i < sorted.length; i++) await refineBetween(sorted[i - 1], sorted[i]);
  }
  const reports = [...results.entries()].sort(([a], [b]) => a - b).map(([, report]) => report);
  const transitions: RuleTransition[] = [];
  for (let i = 1; i < reports.length; i++) {
    const a = reports[i - 1]; const b = reports[i];
    const previous = new Map(a.findings.map(f => [f.id, f.status]));
    for (const finding of b.findings) {
      const from = previous.get(finding.id);
      if (from && from !== finding.status) {
        transitions.push({ ruleId: finding.id, previousWidth: a.viewport.width, width: b.viewport.width, from, to: finding.status,
          precision: b.viewport.width - a.viewport.width === 1 ? 'one-pixel' : 'sampled' });
      }
    }
  }
  return { reports, transitions };
}
export function widthRange(min: number, max: number, step: number): number[] {
  if (![min, max, step].every(Number.isInteger) || min < 200 || max > 10000 || min > max || step < 1) {
    throw new Error('Invalid scan range. Expected --scan MIN:MAX:STEP, integers 200..10000, STEP >= 1');
  }
  const widths = [];
  for (let width = min; width <= max; width += step) widths.push(width);
  if (widths.at(-1) !== max) widths.push(max);
  if (widths.length > 200) throw new Error('Scan range has too many coarse widths; increase the step (maximum 200)');
  return widths;
}
