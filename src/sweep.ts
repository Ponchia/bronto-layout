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
/** Precise facts about sampled widths, never a claim about untested intervals. */
export interface SweepSampling {
  coarseWidths: number[];
  interiorProbes: number;
  interiorWidths: number[];
  largestUntestedGapPx: number;
  limitation: string;
}
export interface SweepResult { reports: LayoutReport[]; transitions: RuleTransition[]; sampling: SweepSampling }
function signature(report: LayoutReport): string {
  return report.findings.map(f => `${f.id}:${f.status}`).join('|');
}
/**
 * Deterministic responsive sampling. Explicit interior probes can discover a
 * failure island whose coarse endpoints agree; refinement then bisects every
 * *observed* state transition. Neither operation proves unobserved widths.
 * The entire coarse + probe plan is budget-checked BEFORE any measurement.
 */
export async function sweepLayout(
  widths: readonly number[],
  check: (width: number) => Promise<LayoutReport>,
  refine = false,
  maxSamples = 200,
  interiorProbes = 0
): Promise<SweepResult> {
  if (!widths.length || !widths.every(w => Number.isInteger(w) && w >= 200 && w <= 10000))
    throw new Error('Viewport widths must be integers from 200 to 10000');
  if (!Number.isInteger(maxSamples) || maxSamples < 1 || maxSamples > 2000)
    throw new Error('maxSamples must be an integer from 1 to 2000');
  if (!Number.isInteger(interiorProbes) || interiorProbes < 0 || interiorProbes > 8)
    throw new Error('interiorProbes must be an integer from 0 to 8');
  const sorted = [...new Set(widths)].sort((a, b) => a - b);
  const interior = new Set<number>();
  for (let i = 1; i < sorted.length; i++) {
    const lo = sorted[i - 1], hi = sorted[i];
    for (let probe = 1; probe <= interiorProbes; probe++) {
      const width = lo + Math.round((hi - lo) * probe / (interiorProbes + 1));
      if (width > lo && width < hi) interior.add(width);
    }
  }
  const initial = [...new Set([...sorted, ...interior])].sort((a, b) => a - b);
  if (initial.length > maxSamples) throw new Error(
    `Responsive sampling needs ${initial.length} coarse/probe widths, exceeding --max-samples ${maxSamples}; reduce --interior-probes or scan range`
  );
  const results = new Map<number, LayoutReport>();
  const sample = async (width: number) => {
    const saved = results.get(width);
    if (saved) return saved;
    if (results.size >= maxSamples) throw new Error(
      `Viewport scan exceeded ${maxSamples} samples; increase --max-samples or shorten range`
    );
    const value = await check(width);
    results.set(width, value);
    return value;
  };
  for (const width of initial) await sample(width);
  if (refine) {
    const refineBetween = async (lo: number, hi: number): Promise<void> => {
      if (hi - lo <= 1 || signature(results.get(lo)!) === signature(results.get(hi)!)) return;
      const mid = Math.floor((lo + hi) / 2);
      await sample(mid);
      await refineBetween(lo, mid);
      await refineBetween(mid, hi);
    };
    // Include every interior probe: a pass/fail/pass island creates TWO
    // boundaries even when the original coarse endpoints both pass.
    for (let i = 1; i < initial.length; i++) await refineBetween(initial[i - 1], initial[i]);
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
  const observed = reports.map(r => r.viewport.width);
  const largestUntestedGapPx = observed.reduce((max, width, index) =>
    index ? Math.max(max, width - observed[index - 1] - 1) : max, 0);
  return { reports, transitions, sampling: {
    coarseWidths: sorted, interiorProbes, interiorWidths: [...interior].sort((a, b) => a - b),
    largestUntestedGapPx,
    limitation: 'Only listed widths and browser states were measured; the gap count covers the requested coarse range only, and unobserved failures remain possible'
  } };
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
