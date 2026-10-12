/** Draft observed layout relationships; only an explicit approval turns them into rules. */
import type { LayoutRule, LayoutSnapshot } from './core.js';
import { evaluateLayout } from './core.js';
import { parseContract, type LayoutContract } from './contract.js';
import type { LayoutAction } from './actions.js';
import type { LayoutScenario } from './scenario.js';

export interface ContractProposal {
  id: string;
  rule: LayoutRule;
  rationale: string;
  sampledWidths: number[];
  deviations: { width: number; value: number; tolerance: number }[];
  reviewRequired: true;
}
export interface ContractDiscoveryDraft {
  draftSchemaVersion: 1;
  url: string;
  widths: number[];
  selectors: Record<string, string>;
  scenario?: LayoutScenario;
  actions?: LayoutAction[];
  proposals: ContractProposal[];
  coverage: { groupAliases: string[]; candidateCount: number; truncated: boolean };
  limitations: string[];
}

export function suggestLayoutContracts(
  url: string,
  selectors: Record<string, string>,
  snapshots: readonly LayoutSnapshot[],
  groupAliases: readonly string[] = [],
  truncated = false,
  context: Pick<LayoutContract, 'scenario' | 'actions'> = {}
): ContractDiscoveryDraft {
  if (!snapshots.length || snapshots.some(s => !Number.isInteger(s.viewport.width)))
    throw new Error('Suggestions require measured viewport snapshots');
  const widths = snapshots.map(s => s.viewport.width);
  if (new Set(widths).size !== widths.length) throw new Error('Duplicate suggestion viewport widths');
  const proposals: ContractProposal[] = [];
  const maxCandidates = 16;
  const stable = Object.keys(selectors).filter(alias => snapshots.every(s =>
    (s.selectorCounts?.[alias] ?? s.selectors[alias]?.length ?? 0) === 1 &&
    s.selectors[alias]?.length === 1));
  const groups = groupAliases.filter(alias => Object.hasOwn(selectors, alias) &&
    snapshots.every(s => (s.selectorCounts?.[alias] ?? 0) >= 3 &&
      s.selectorCounts?.[alias] === s.selectors[alias]?.length));
  const add = (rule: LayoutRule, rationale: string) => {
    if (proposals.length >= maxCandidates) return;
    const reports = snapshots.map(s => evaluateLayout(s, [rule]).findings[0]);
    const active = reports.map((r, i) => ({ r, width: widths[i] })).filter(x => x.r.status !== 'skip');
    if (!active.length || !active.every(x => x.r.status === 'pass' && Number.isFinite(x.r.deviation))) return;
    proposals.push({ id: rule.id, rule, rationale, sampledWidths: active.map(x => x.width),
      deviations: active.map(x => ({ width: x.width, value: x.r.deviation!, tolerance: x.r.tolerance ?? 0 })),
      reviewRequired: true });
  };
  // Never suggest preserving an already-overflowing page as the intended baseline.
  add({ id: 'document-horizontal-fit', type: 'document-overflow', tolerance: 1 },
    'No horizontal document overflow was measured at the sampled viewport widths');
  // Give repeated groups priority over incidental aligned text. A scoped
  // suggestion needs >=2 consecutive passing viewport samples; it never
  // asserts the rule across a measured width where it failed or was unmeasurable.
  const ordered = snapshots.map(s => s).sort((a, b) => a.viewport.width - b.viewport.width);
  for (const alias of groups) for (const axis of ['x', 'y'] as const) {
    const base = { id: `uniform-${axis}-${alias}`, type: 'uniform-gaps' as const,
      element: alias, axis, tolerance: 2 };
    const statuses = ordered.map(s => evaluateLayout(s, [base]).findings[0].status);
    const runs: number[][] = [];
    let current: number[] = [];
    statuses.forEach((status, index) => {
      if (status === 'pass') current.push(index);
      else { if (current.length) runs.push(current); current = []; }
    });
    if (current.length) runs.push(current);
    const best = runs.sort((a, b) => b.length - a.length)[0];
    if (!best || best.length < 2) continue;
    const first = ordered[best[0]].viewport.width;
    const last = ordered[best[best.length - 1]].viewport.width;
    const allPassed = best.length === ordered.length;
    add(allPassed ? base : { ...base, minWidth: first, maxWidth: last },
      `${alias} has repeated ${axis}-axis gaps at observed widths ` +
      (allPassed ? widths.join(', ') : `${first}..${last}`) + 'px; inspect intentional spacing before accepting');
  }
  const landmarkAliases = stable.filter(alias => !groups.includes(alias)).slice(0, 7);
  for (const alias of landmarkAliases) {
    const elements = snapshots.map(s => s.selectors[alias][0]);
    // Outer page shells and section containers are more appropriate contract
    // candidates than tiny images, icons or individual text glyphs.
    if (!elements.every((el, i) => el.rect.width >= Math.min(120, snapshots[i].viewport.width * .4))) continue;
    add({ id: 'contained-' + alias, type: 'contained', element: alias, in: 'viewport', axis: 'x', tolerance: 2 },
      `${alias} stays inside the usable horizontal viewport at all sampled widths`);
    if (/main|shell|container|page|site|gallery/i.test(alias) &&
        elements.every((el, i) => el.rect.width < (snapshots[i].viewport.contentWidth ??
          snapshots[i].viewport.width) - 16)) {
      add({ id: 'centered-' + alias, type: 'centered', element: alias, in: 'viewport', axis: 'x', tolerance: 2 },
        `${alias} appears horizontally centered at all sampled widths`);
    }
  }
  // Keep alignment leads few and explainable; avoid every accidental pair
  // of nested page elements that happens to share both edges.
  let alignCount = 0;
  for (let i = 0; i < landmarkAliases.length && alignCount < 4; i++) {
    for (let j = i + 1; j < landmarkAliases.length && alignCount < 4; j++) {
      const a = landmarkAliases[i], b = landmarkAliases[j];
      if (!snapshots.every(s => Math.min(s.selectors[a][0].rect.width,
        s.selectors[b][0].rect.width) >= 100)) continue;
      const before = proposals.length;
      add({ id: `align-left-${a}-${b}`, type: 'align-edge', a, b, edgeA: 'left', tolerance: 2 },
        `${a} and ${b} share their left edge at all sampled widths`);
      // Right-edge alignment is an alternative lead, not a redundant extra
      // rule when the same pair already shares its left edge.
      if (before === proposals.length) add({ id: `align-right-${a}-${b}`, type: 'align-edge',
        a, b, edgeA: 'right', tolerance: 2 },
        `${a} and ${b} share their right edge at all sampled widths`);
      if (proposals.length > before) alignCount++;
    }
  }
  return {
    draftSchemaVersion: 1, url, widths, selectors: { ...selectors }, proposals,
    ...(context.scenario ? { scenario: { ...context.scenario } } : {}),
    ...(context.actions ? { actions: context.actions.map(action => ({ ...action })) } : {}),
    coverage: { groupAliases: [...groups], candidateCount: Object.keys(selectors).length, truncated },
    limitations: [
      'All proposals describe only observed layouts at the listed widths and states',
      'Passing geometry is not evidence of deliberate design intent',
      'No proposal is a blocking check until explicitly accepted',
      'Unseen fonts, routes, states, browsers, and viewport widths have not been checked'
    ]
  };
}

export function acceptContractProposals(input: unknown, ids: readonly string[]): LayoutContract {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid proposal draft');
  const draft = input as Partial<ContractDiscoveryDraft>;
  if (draft.draftSchemaVersion !== 1 || typeof draft.url !== 'string' ||
      !Array.isArray(draft.widths) || !draft.selectors || typeof draft.selectors !== 'object' ||
      !Array.isArray(draft.proposals)) throw new Error('Invalid proposal draft schema');
  if (!ids.length || new Set(ids).size !== ids.length) throw new Error('Provide distinct proposal IDs to accept');
  const byId = new Map<string, ContractProposal>();
  for (const entry of draft.proposals) {
    if (!entry || typeof entry.id !== 'string' || entry.rule?.id !== entry.id ||
      entry.reviewRequired !== true || byId.has(entry.id)) throw new Error('Invalid/duplicate proposal entry');
    byId.set(entry.id, entry);
  }
  const rules = ids.map(id => {
    const proposal = byId.get(id);
    if (!proposal) throw new Error('Unknown proposal ID: ' + id);
    return { ...proposal.rule, description: proposal.rationale };
  });
  // Do not carry unrelated auto-discovered selectors into the approved
  // contract: only names referenced by the accepted rules are durable intent.
  const referenced = new Set<string>();
  for (const rule of rules) {
    for (const key of ['a', 'b', 'element', 'in'] as const) {
      if (key in rule) {
        const alias = (rule as unknown as Record<string, unknown>)[key];
        if (typeof alias === 'string' && alias !== 'viewport') referenced.add(alias);
      }
    }
    if ('elements' in rule) for (const alias of rule.elements) referenced.add(alias);
  }
  const selected = Object.fromEntries(Object.entries(draft.selectors)
    .filter(([alias]) => referenced.has(alias)));
  return parseContract({ schemaVersion: 1, url: draft.url, widths: draft.widths,
    selectors: selected, rules,
    ...(draft.scenario !== undefined ? { scenario: draft.scenario } : {}),
    ...(draft.actions !== undefined ? { actions: draft.actions } : {}) });
}
