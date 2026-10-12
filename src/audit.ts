/**
 * Conservative zero-contract diagnostics over observed browser facts.
 * Positive mechanical observations and review-only leads remain separate.
 * Pure TypeScript: no browser, DOM, Node, Playwright or screenshot dependency.
 */
import type { LayoutSnapshot, OverflowCandidate } from './core.js';

export interface ImageLead {
  path: string;
  source: string;
  width: number;
  height: number;
}
export interface TextClipLead {
  path: string;
  overflowPx: number;
  clientWidth: number;
  scrollWidth: number;
  overflowStyle: string;
}
export interface PageAuditObservations {
  visitedElements: number;
  traversalLimit: number;
  truncated: boolean;
  visibleElements: number;
  totalImages: number;
  unloadedImages: number;
  brokenImageCount: number;
  brokenImages: ImageLead[];
  omittedBrokenImages: number;
  textClipCount: number;
  textClips: TextClipLead[];
  omittedTextClips: number;
  intentionalEllipses: number;
  visuallyHiddenTextExcluded: number;
  embeddedFrames: number;
}
export type AuditCoverageStatus = 'supported-scope-measured' | 'known-uninspected-content' | 'truncated';
export type AuditClassification = 'measured' | 'review';
export interface AuditFinding {
  code: 'document-horizontal-overflow' | 'broken-image' | 'possible-text-clipping' | 'pending-image' | 'embedded-frame-uninspected';
  classification: AuditClassification;
  severity: 'error' | 'warning';
  message: string;
  path?: string;
  measuredPx?: number;
  source?: string;
  count?: number;
  /** Candidates are observations, not proven CSS root causes. */
  overflowCandidates?: OverflowCandidate[];
}
export interface ViewportAudit {
  viewport: LayoutSnapshot['viewport'];
  coverage: PageAuditObservations & {
    scope: 'top-document-and-open-shadow-roots';
    status: AuditCoverageStatus;
    limitations: string[];
  };
  findings: AuditFinding[];
  summary: { errors: number; warnings: number; verified: boolean; coverageStatus: AuditCoverageStatus };
}

/** Convert bounded DOM evidence and a geometry snapshot to honest conclusions. */
export function analyzePageAudit(
  snapshot: LayoutSnapshot,
  evidence: PageAuditObservations
): ViewportAudit {
  const findings: AuditFinding[] = [];
  const contentWidth = snapshot.viewport.contentWidth ?? snapshot.viewport.width;
  const overflow = Math.max(0, snapshot.document.width - contentWidth);
  if (overflow > 1) findings.push({
    code: 'document-horizontal-overflow', classification: 'measured', severity: 'error',
    measuredPx: Number(overflow.toFixed(2)),
    message: 'Document scroll width exceeds the usable viewport by ' + overflow.toFixed(2) +
      ' CSS px. This may be intentional; review the component before changing it.',
    ...(snapshot.overflowCandidates?.length ? { overflowCandidates: snapshot.overflowCandidates.slice(0, 8) } : {})
  });
  for (const image of evidence.brokenImages) findings.push({
    code: 'broken-image', classification: 'measured', severity: 'error',
    path: image.path, source: image.source,
    message: 'Visible image finished loading without intrinsic image data'
  });
  if (evidence.brokenImageCount > evidence.brokenImages.length) findings.push({
    code: 'broken-image', classification: 'measured', severity: 'error',
    count: evidence.brokenImageCount - evidence.brokenImages.length,
    message: evidence.omittedBrokenImages + ' additional failed images omitted from the bounded report'
  });
  for (const clip of evidence.textClips) findings.push({
    code: 'possible-text-clipping', classification: 'review', severity: 'warning',
    path: clip.path, measuredPx: Number(clip.overflowPx.toFixed(2)),
    message: 'Leaf text scroll width exceeds its clipped client width by ' +
      clip.overflowPx.toFixed(2) + ' CSS px; check whether truncation is intentional'
  });
  if (evidence.textClipCount > evidence.textClips.length) findings.push({
    code: 'possible-text-clipping', classification: 'review', severity: 'warning',
    count: evidence.textClipCount - evidence.textClips.length,
    message: evidence.omittedTextClips + ' additional possible clipped-text elements omitted'
  });
  if (evidence.embeddedFrames > 0) findings.push({
    code: 'embedded-frame-uninspected', classification: 'review', severity: 'warning',
    count: evidence.embeddedFrames,
    message: evidence.embeddedFrames + ' embedded frame(s) were detected; their internal DOM/layout was not inspected'
  });
  if (evidence.unloadedImages > 0) findings.push({
    code: 'pending-image', classification: 'review', severity: 'warning',
    count: evidence.unloadedImages,
    message: evidence.unloadedImages + ' visible image(s) had not finished loading during the inspection'
  });
  const coverageStatus: AuditCoverageStatus = evidence.truncated ? 'truncated'
    : evidence.embeddedFrames > 0 ? 'known-uninspected-content' : 'supported-scope-measured';
  return {
    viewport: snapshot.viewport,
    coverage: { ...evidence,
      scope: 'top-document-and-open-shadow-roots', status: coverageStatus,
      limitations: [
        'Embedded frame documents are not traversed',
        'Closed shadow roots cannot be inspected or counted reliably',
        'Canvas/WebGL and visual paint-order relationships are not analyzed',
        'Only the measured viewport and navigation state are observed'
      ]
    },
    findings,
    summary: {
      errors: findings.filter(f => f.severity === 'error').length,
      warnings: findings.filter(f => f.severity === 'warning').length,
      // Backward-compatible completeness for the supported traversal only.
      // Never interpret this as proof that every page surface was inspected.
      verified: !evidence.truncated,
      coverageStatus
    }
  };
}
