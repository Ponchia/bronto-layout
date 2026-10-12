/** Reassess provisional rules on a later page revision without approving them.
 * Measurements are factual and bounded to the original recorded viewport widths.
 */
import { evaluateLayout, type LayoutSnapshot, type LayoutFinding } from './core.js';
import { acceptContractProposals, type ContractDiscoveryDraft } from './contract-discovery.js';
import { validWidth } from './contract.js';

export type ProposalReviewStatus = 'still-satisfied' | 'changed' | 'unverified';
export interface ProposalReviewAtWidth {
  width: number;
  status: ProposalReviewStatus;
  findingStatus: LayoutFinding['status'];
  findingCode: LayoutFinding['code'];
  deviation?: number;
  recordedDeviation?: number;
  tolerance?: number;
  message: string;
}
export interface ProposalReviewResult {
  id: string;
  status: ProposalReviewStatus;
  checkedWidths: number[];
  observations: ProposalReviewAtWidth[];
}
export interface ProposalReviewReport {
  schemaVersion: 1;
  mode: 'review-draft';
  sourceUrl: string;
  candidateUrl: string;
  widths: number[];
  sourceDiscoveryTruncated: boolean;
  sourceLimitReasons: string[];
  summary: { total: number; stillSatisfied: number; changed: number; unverified: number };
  proposals: ProposalReviewResult[];
  limitations: string[];
}

export function reviewContractProposals(
  draft: ContractDiscoveryDraft,
  candidateUrl: string,
  snapshots: readonly LayoutSnapshot[]
): ProposalReviewReport {
  if (!draft || draft.draftSchemaVersion !== 1 || typeof draft.url !== 'string' ||
      !draft.url.trim() || !Array.isArray(draft.widths) || !draft.widths.length ||
      draft.widths.some(width => !validWidth(width)) ||
      new Set(draft.widths).size !== draft.widths.length ||
      !Array.isArray(draft.proposals) || draft.proposals.length > 32) {
    throw new Error('Invalid proposal draft for review');
  }
  if (typeof candidateUrl !== 'string' || !candidateUrl.trim()) {
    throw new Error('Candidate URL is required for proposal review');
  }
  // Reuse strict contract parsing: all proposed constraints, selector aliases,
  // scenarios and declarative interactions must be valid before evaluation.
  if (draft.proposals.length) acceptContractProposals(draft, draft.proposals.map(item => item.id));
  if (snapshots.length !== draft.widths.length ||
      new Set(snapshots.map(s => s.viewport?.width)).size !== draft.widths.length ||
      snapshots.some(s => !draft.widths.includes(s.viewport?.width))) {
    throw new Error('Proposal review requires exactly the original distinct viewport widths');
  }
  const byWidth = new Map(snapshots.map(s => [s.viewport.width, s]));
  const proposals = draft.proposals.map(proposal => {
    if (!Array.isArray(proposal.sampledWidths) || !proposal.sampledWidths.length ||
        new Set(proposal.sampledWidths).size !== proposal.sampledWidths.length ||
        proposal.sampledWidths.some(width => !draft.widths.includes(width))) {
      throw new Error('Invalid recorded sample widths for ' + proposal.id);
    }
    const byRecorded = new Map(proposal.deviations?.map(value => [value.width, value.value]) ?? []);
    const observations = proposal.sampledWidths.map(width => {
      const finding = evaluateLayout(byWidth.get(width)!, [proposal.rule]).findings[0];
      const status: ProposalReviewStatus = finding.status === 'pass' &&
        Number.isFinite(finding.deviation)
        ? 'still-satisfied'
        : finding.status === 'fail' && finding.code === 'constraint'
          ? 'changed' : 'unverified';
      return {
        width, status, findingStatus: finding.status, findingCode: finding.code,
        ...(Number.isFinite(finding.deviation) ? { deviation: finding.deviation } : {}),
        ...(Number.isFinite(byRecorded.get(width)) ? { recordedDeviation: byRecorded.get(width) } : {}),
        ...(Number.isFinite(finding.tolerance) ? { tolerance: finding.tolerance } : {}),
        message: finding.message
      };
    });
    const status: ProposalReviewStatus = observations.some(item => item.status === 'unverified')
      ? 'unverified' : observations.some(item => item.status === 'changed')
        ? 'changed' : 'still-satisfied';
    return { id: proposal.id, status, checkedWidths: [...proposal.sampledWidths], observations };
  });
  return {
    schemaVersion: 1, mode: 'review-draft', sourceUrl: draft.url, candidateUrl,
    widths: [...draft.widths], sourceDiscoveryTruncated: Boolean(draft.coverage?.truncated),
    sourceLimitReasons: [...(draft.coverage?.limitReasons ?? [])],
    summary: { total: proposals.length,
      stillSatisfied: proposals.filter(item => item.status === 'still-satisfied').length,
      changed: proposals.filter(item => item.status === 'changed').length,
      unverified: proposals.filter(item => item.status === 'unverified').length },
    proposals,
    limitations: [
      'These are unapproved candidate rules, never inferred design intent or automatic fixes',
      'Still-satisfied means the measured rule passes at its originally sampled widths and state only',
      'Missing, ambiguous, unsupported or incomplete geometry is unverified, not a passing layout',
      'Original discovery may have omitted candidates due to inspection limits',
      'Different fonts, content, user interactions, browsers and unsampled widths remain outside scope'
    ]
  };
}
