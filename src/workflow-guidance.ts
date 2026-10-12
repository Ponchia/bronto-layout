/**
 * Human-readable, actionable guidance for the review-first contract lifecycle.
 * This module is pure and never approves an inferred rule or executes commands.
 */
import type { ContractDiscoveryDraft } from './contract-discovery.js';
import type { ProposalReviewReport, ProposalReviewAtWidth } from './proposal-review.js';

const fileArg = (file: string): string => JSON.stringify(file);
const decimal = (n: number) => Number(n.toFixed(3)).toString();

function observation(o: ProposalReviewAtWidth): string {
  if (o.status === 'unverified') return `${o.width}px: unverified (${o.message})`;
  const d = Number.isFinite(o.deviation) ? decimal(o.deviation!) + o.unit : 'unknown';
  const tolerance = Number.isFinite(o.tolerance) ? decimal(o.tolerance!) + o.unit : 'unknown';
  return `${o.width}px: Δ ${d} (tolerance ${tolerance})`;
}

export function describeSuggestedContracts(draft: ContractDiscoveryDraft, savedFile?: string): string {
  const rows = [
    `Bronto Layout — ${draft.proposals.length} unapproved layout candidates at ${draft.widths.join(', ')}px`,
    ...draft.proposals.map(p => `  ${p.id} [${p.sampledWidths.join(', ')}px]: ${p.rationale}`),
    ...(draft.coverage.truncated ? [
      `  PARTIAL SELECTOR DISCOVERY: ${draft.coverage.limitReasons?.join(', ') || 'limit reached'}`
    ] : []),
    '  No rule was approved or made a blocking check.'
  ];
  if (!savedFile) return [...rows, 'Save the draft with --out FILE to review and approve it later.'].join('\n');
  return [...rows,
    `Draft saved: ${savedFile}`,
    `Next: bronto-layout review-draft --draft ${fileArg(savedFile)} --url NEW_URL`,
    `Then choose intentional rules: bronto-layout approve --draft ${fileArg(savedFile)} --accept RULE_ID[,RULE_ID...] --out bronto-layout.json`,
    'Check accepted rules: bronto-layout check --spec bronto-layout.json'
  ].join('\n');
}

export function describeProposalReview(result: ProposalReviewReport): string {
  return [
    `Bronto Layout proposal review — ${result.sourceUrl} → ${result.candidateUrl}`,
    ...result.proposals.flatMap(proposal => [
      `  ${proposal.status.toUpperCase()}: ${proposal.id}`,
      ...proposal.observations.map(point => `    ${observation(point)}`)
    ]),
    `Total: ${result.summary.stillSatisfied} still satisfied, ${result.summary.changed} changed, ${result.summary.unverified} unverified`,
    ...(result.sourceDiscoveryTruncated ? [
      `  Original selector discovery was partial: ${result.sourceLimitReasons.join(', ') || 'bounded output'}`
    ] : []),
    'No proposal was approved. Deviations concern only the originally sampled widths and state.'
  ].join('\n');
}

export function describeApprovedContract(file: string, count: number): string {
  return [
    `Approved ${count} explicitly reviewed ${count === 1 ? 'rule' : 'rules'}: ${file}`,
    `Validate: bronto-layout validate --spec ${fileArg(file)}`,
    `Check: bronto-layout check --spec ${fileArg(file)} --json --compact`,
    'Only the accepted relationships are now assertions; the rest of the design remains outside the contract.'
  ].join('\n');
}
