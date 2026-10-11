import type { AuditFinding, ViewportAudit } from './audit.js';

/**
 * Compare browser-observed automatic audits across the SAME sampled viewports.
 * A regression is new/worsening measured evidence, not a guess about design
 * intent. Review-only changes never fail the CLI.
 */
export type AuditChangeKind = 'regression' | 'improvement' | 'review-new' | 'review-resolved';
export interface AuditChange {
  width: number;
  kind: AuditChangeKind;
  code: AuditFinding['code'];
  classification: AuditFinding['classification'];
  path?: string;
  baselineValue?: number;
  candidateValue?: number;
  message: string;
}
export interface AuditComparisonSummary {
  viewports: number;
  measuredRegressions: number;
  measuredImprovements: number;
  reviewChanges: number;
  unverifiedViewports: number;
  candidateMeasuredIssues: number;
  baselineMeasuredIssues: number;
}
export interface AuditComparison {
  schemaVersion: 1;
  mode: 'audit-compare';
  baselineUrl: string;
  candidateUrl: string;
  summary: AuditComparisonSummary;
  sampledWidths: number[];
  changes: AuditChange[];
  unverified: Array<{ width:number; reasons:string[] }>;
  baseline: ViewportAudit[];
  candidate: ViewportAudit[];
}

const findAll = (report: ViewportAudit, code: AuditFinding['code']) =>
  report.findings.filter(finding => finding.code === code);

const issueValue = (report: ViewportAudit, code: AuditFinding['code']): number =>
  findAll(report, code).reduce((value, finding) =>
    Math.max(value, Number.isFinite(finding.measuredPx) ? finding.measuredPx! : 0), 0);

const presenceCount = (report: ViewportAudit, code: AuditFinding['code']): number =>
  findAll(report, code).reduce((value, finding) =>
    value + (Number.isInteger(finding.count) && finding.count! > 0 ? finding.count! : 1), 0);

/** Exclude incomplete or un-attributable observations rather than scoring false clean results. */
function reasonsForIncomplete(report: ViewportAudit): string[] {
  const reasons: string[] = [];
  const supported = new Set([
    'document-horizontal-overflow', 'broken-image', 'possible-text-clipping',
    'pending-image', 'embedded-frame-uninspected'
  ]);
  if (report.findings.some(finding => !supported.has(finding.code))) {
    reasons.push('Encountered a new detector that has no defined comparison semantics');
  }
  if (report.findings.some(finding => finding.code === 'document-horizontal-overflow' &&
      !Number.isFinite(finding.measuredPx))) {
    reasons.push('Document overflow lacks a valid browser-measured pixel deviation');
  }
  if (!report.summary.verified || report.coverage.truncated) {
    reasons.push('DOM traversal did not cover all visible elements');
  }
  if (report.coverage.omittedBrokenImages > 0 || report.coverage.omittedTextClips > 0) {
    reasons.push('Browser diagnostics omitted affected DOM elements due to output limits');
  }
  for (const code of ['broken-image','possible-text-clipping']) {
    const findings = report.findings.filter(finding => finding.code === code);
    const paths = findings.map(finding => finding.path);
    if (paths.some(path => typeof path !== 'string' || !path.trim())) {
      reasons.push('Browser did not identify the affected '+code+' element');
    } else if (new Set(paths).size !== paths.length) {
      reasons.push('Browser returned ambiguous duplicate DOM element paths for '+code);
    }
  }
  return reasons;
}

export function comparePageAudits(
  baselineUrl: string,
  candidateUrl: string,
  baseline: readonly ViewportAudit[],
  candidate: readonly ViewportAudit[],
  significantPx = 1
): AuditComparison {
  if (!Number.isFinite(significantPx) || significantPx < 0) {
    throw new Error('significantPx must be finite and nonnegative');
  }
  const a = new Map(baseline.map(report => [report.viewport.width, report]));
  const b = new Map(candidate.map(report => [report.viewport.width, report]));
  if (baseline.length !== a.size || candidate.length !== b.size ||
      a.size !== b.size || [...a.keys()].some(width => !b.has(width))) {
    throw new Error('Automatic audit comparison requires identical unique viewport widths');
  }
  const changes: AuditChange[] = [];
  const unverified: AuditComparison['unverified'] = [];
  let measuredRegressions = 0, measuredImprovements = 0, reviewChanges = 0;
  for (const width of [...a.keys()].sort((left, right) => left - right)) {
    const before = a.get(width)!;
    const after = b.get(width)!;
    const reasons = [...reasonsForIncomplete(before), ...reasonsForIncomplete(after)];
    if (reasons.length) {
      unverified.push({ width, reasons:[...new Set(reasons)] });
      continue;
    }

    const add = (change: AuditChange) => {
      changes.push(change);
      if (change.kind === 'regression') measuredRegressions++;
      else if (change.kind === 'improvement') measuredImprovements++;
      else reviewChanges++;
    };
    const oldOverflow = issueValue(before,'document-horizontal-overflow');
    const newOverflow = issueValue(after,'document-horizontal-overflow');
    const delta = newOverflow - oldOverflow;
    if (delta > significantPx) add({
      width,kind:'regression',code:'document-horizontal-overflow',
      classification:'measured',baselineValue:oldOverflow,candidateValue:newOverflow,
      message:'Observed document-wide horizontal overflow worsened by '+delta.toFixed(2)+' CSS px'
    });
    else if (delta < -significantPx) add({
      width,kind:'improvement',code:'document-horizontal-overflow',
      classification:'measured',baselineValue:oldOverflow,candidateValue:newOverflow,
      message:'Observed document-wide horizontal overflow improved by '+(-delta).toFixed(2)+' CSS px'
    });

    for (const code of ['broken-image','possible-text-clipping'] as const) {
      const oldPaths = new Set(findAll(before,code).map(finding => finding.path!));
      const newPaths = new Set(findAll(after,code).map(finding => finding.path!));
      const classification = code === 'broken-image' ? 'measured' : 'review';
      for (const path of [...newPaths].sort()) {
        if (oldPaths.has(path)) continue;
        add({width,kind:classification==='measured'?'regression':'review-new',
          code,classification,path,
          message:'New browser-observed '+code+' at '+path});
      }
      for (const path of [...oldPaths].sort()) {
        if (newPaths.has(path)) continue;
        add({width,kind:classification==='measured'?'improvement':'review-resolved',
          code,classification,path,
          message:'Previously observed '+code+' no longer present at '+path});
      }
    }
    for (const code of ['pending-image','embedded-frame-uninspected'] as const) {
      const oldCount = presenceCount(before,code);
      const newCount = presenceCount(after,code);
      if (oldCount === newCount) continue;
      add({width,kind:newCount > oldCount?'review-new':'review-resolved',
        code,classification:'review',baselineValue:oldCount,candidateValue:newCount,
        message:'Review-only '+code+' count changed from '+oldCount+' to '+newCount
      });
    }
  }
  return {
    schemaVersion:1,mode:'audit-compare',baselineUrl,candidateUrl,
    sampledWidths:[...a.keys()].sort((left,right)=>left-right),
    summary:{
      viewports:a.size,measuredRegressions,measuredImprovements,reviewChanges,
      unverifiedViewports:unverified.length,
      baselineMeasuredIssues:baseline.reduce((count,report)=>count+report.summary.errors,0),
      candidateMeasuredIssues:candidate.reduce((count,report)=>count+report.summary.errors,0)
    },
    changes,unverified,baseline:[...baseline],candidate:[...candidate]
  };
}
