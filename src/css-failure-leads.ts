import type { LayoutReport } from './core.js';
import type { CSSInspection } from './css-inspector.js';

/**
 * Relate deterministic layout failures to the selectors that contributed
 * measured element geometry. Unattributed failures are reported explicitly.
 */
export interface CSSFailureSelection {
  selectors: Record<string, string>;
  ruleIdsByAlias: Record<string, string[]>;
  unattributedRuleIds: string[];
}
export interface CSSFailureSourceLead {
  width: number;
  ruleIdsByAlias: Record<string, string[]>;
  unattributedRuleIds: string[];
  inspection?: CSSInspection;
}

export function selectCSSFailureAliases(
  report: LayoutReport,
  selectors: Readonly<Record<string, string>>
): CSSFailureSelection {
  const associations = new Map<string, Set<string>>();
  const unattributedRuleIds: string[] = [];
  for (const finding of report.findings) {
    if (finding.status !== 'fail') continue;
    const matched = new Set((finding.evidence ?? [])
      .map(e => e.alias)
      .filter(alias => Object.hasOwn(selectors, alias)));
    if (!matched.size) {
      unattributedRuleIds.push(finding.id);
      continue;
    }
    for (const alias of matched) {
      const ids = associations.get(alias) ?? new Set<string>();
      ids.add(finding.id);
      associations.set(alias, ids);
    }
  }
  return {
    selectors: Object.fromEntries(Object.entries(selectors).filter(([alias]) => associations.has(alias))),
    ruleIdsByAlias: Object.fromEntries([...associations.entries()].map(([alias, ids]) => [alias, [...ids]])),
    unattributedRuleIds
  };
}
