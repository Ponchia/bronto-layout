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
export interface GridGapLead {
  /** Identifier of the observed GRID CONTAINER, not an attributed faulty child. */
  path: string;
  expectedGapPx: number;
  observedGapsPx: number[];
  maxDeviationPx: number;
  itemCount: number;
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
  /** Optional, explicitly requested GRID-only review lead, never a strict defect. */
  gridGapCount?: number;
  gridGapLeads?: GridGapLead[];
  gridContainersInspected?: number;
  gridContainersOmitted?: number;
}

export type AuditCoverageStatus = 'supported-scope-measured' | 'known-uninspected-content' | 'truncated';
export type AuditClassification = 'measured' | 'review';
export interface AuditFinding {
  code: 'document-horizontal-overflow' | 'broken-image' | 'possible-text-clipping' | 'pending-image' | 'embedded-frame-uninspected' | 'possible-grid-gap-anomaly';
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
  summary: {
    errors: number; warnings: number;
    /** No KNOWN uncovered surfaces; never a guarantee about closed roots or canvas. */
    verified: boolean;
    /** Top-document and open-shadow walk completed regardless of embedded frames. */
    supportedScopeMeasured: boolean;
    coverageStatus: AuditCoverageStatus;
  };
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
  for (const lead of evidence.gridGapLeads ?? []) findings.push({
    code: 'possible-grid-gap-anomaly', classification: 'review', severity: 'warning',
    path: lead.path, measuredPx: Number(lead.maxDeviationPx.toFixed(2)),
    message: 'Observed grid child gaps ' + lead.observedGapsPx.map(x => x.toFixed(1)).join(', ') +
      'px versus declared column-gap ' + lead.expectedGapPx.toFixed(1) +
      'px across ' + lead.itemCount + ' similarly sized items; verify intentional transforms and placement'
  });
  if ((evidence.gridGapCount ?? 0) > (evidence.gridGapLeads?.length ?? 0)) findings.push({
    code: 'possible-grid-gap-anomaly', classification: 'review', severity: 'warning',
    count: (evidence.gridGapCount ?? 0) - (evidence.gridGapLeads?.length ?? 0),
    message: 'Additional potential grid gap anomalies omitted from the bounded review list'
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
        'Only the measured viewport and navigation state are observed',
        ...(evidence.gridContainersOmitted ? ['Grid gap review omitted ' + evidence.gridContainersOmitted + ' candidate containers due to bounded inspection limits'] : [])
      ]
    },
    findings,
    summary: {
      errors: findings.filter(f => f.severity === 'error').length,
      warnings: findings.filter(f => f.severity === 'warning').length,
      // `verified` must NOT be true when an iframe is explicitly uninspected.
      // Supported scope completeness is a separate fact; neither means that
      // closed roots, CSS paint order or canvas internals were checked.
      verified: coverageStatus === 'supported-scope-measured',
      supportedScopeMeasured: !evidence.truncated,
      coverageStatus
    }
  };
}
