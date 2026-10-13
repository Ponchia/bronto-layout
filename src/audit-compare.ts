import type { AuditFinding, ViewportAudit } from './audit.js';

/**
 * Compare browser-observed automatic audits across the SAME sampled viewports.
 * A regression is new/worsening measured evidence, not a guess about design
 * intent. Review-only changes never fail the CLI.
 */
export type AuditChangeKind = 'regression' | 'improvement' | 'review-new' | 'review-resolved' | 'review-worsened' | 'review-improved';
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

/**
 * Compare element-level leads without treating DOM positional selectors as
 * stable identities. A moved element can change `:nth-of-type()` without its
 * visual defect changing. Broken image resource URLs can identify one unique
 * persisted failure; only unique public URL pathnames are used, ignoring
 * host differences between baseline and candidate. Duplicates/placeholder
 * values are deliberately not match keys.
 */
function unmatchedElementFindings(
  before: AuditFinding[], after: AuditFinding[],
  code: 'broken-image' | 'possible-text-clipping' | 'possible-grid-gap-anomaly' | 'possible-sibling-overlap'
): { before: AuditFinding[]; after: AuditFinding[] } {
  const oldByPath = new Map(before.map(f => [f.path, f]));
  const newByPath = new Map(after.map(f => [f.path, f]));
  const old = before.filter(f => !newByPath.has(f.path));
  const fresh = after.filter(f => !oldByPath.has(f.path));
  if (code !== 'broken-image') return { before: old, after: fresh };
  const identity = (source?: string): string | undefined => {
    if (typeof source !== 'string' || source.length > 300) return undefined;
    try {
      const url = new URL(source);
      if (!['http:', 'https:'].includes(url.protocol) || url.pathname === '/' ||
          url.search || url.hash || url.username || url.password) return undefined;
      // Baseline and candidate may be on different hosts or localhost ports.
      // The same unique public pathname is a useful resource identity lead;
      // no pathname is authoritative when two elements share that resource.
      return url.pathname;
    } catch { return undefined; }
  };
  const countKey = (items: AuditFinding[], key: string) =>
    items.filter(item => identity(item.source) === key).length;
  const matched = new Set<string>();
  for (const item of old) {
    const key = identity(item.source);
    if (key && countKey(old, key) === 1 && countKey(fresh, key) === 1) matched.add(key);
  }
  return {
    before: old.filter(item => !matched.has(identity(item.source) ?? '')),
    after: fresh.filter(item => !matched.has(identity(item.source) ?? ''))
  };
}

/** Exclude incomplete or un-attributable observations rather than scoring false clean results. */
function reasonsForIncomplete(report: ViewportAudit): string[] {
  const reasons: string[] = [];
  const supported = new Set([
    'document-horizontal-overflow', 'broken-image', 'possible-text-clipping',
    'pending-image', 'embedded-frame-uninspected', 'canvas-content-uninspected',
    'possible-grid-gap-anomaly', 'possible-sibling-overlap'
  ]);
  if (report.findings.some(finding => !supported.has(finding.code))) {
    reasons.push('Encountered a new detector that has no defined comparison semantics');
  }
  if (report.findings.some(finding => finding.code === 'document-horizontal-overflow' &&
      !Number.isFinite(finding.measuredPx))) {
    reasons.push('Document overflow lacks a valid browser-measured pixel deviation');
  }
  // Current reports separate known frame gaps from the completeness of the
  // supported DOM traversal. Old reports predate that separation.
  const scopeMeasured = report.summary.supportedScopeMeasured ?? report.summary.verified;
  if (!scopeMeasured || report.coverage.truncated) {
    reasons.push('DOM traversal did not cover all visible elements');
  }
  if (report.coverage.omittedBrokenImages > 0 || report.coverage.omittedTextClips > 0) {
    reasons.push('Browser diagnostics omitted affected DOM elements due to output limits');
  }
  if ((report.coverage.gridContainersOmitted ?? 0) > 0) {
    reasons.push('Opt-in grid-gap review omitted candidate containers due to bounded inspection limits');
  }
  if ((report.coverage.overlapContainersOmitted ?? 0) > 0 ||
      (report.coverage.siblingOverlapCount ?? 0) > (report.coverage.siblingOverlapLeads?.length ?? 0)) {
    reasons.push('Opt-in sibling overlap review omitted candidate containers or leads due to bounded inspection limits');
  }
  if (findAll(report, 'possible-sibling-overlap').some(finding =>
      !Array.isArray(finding.relatedPaths) || finding.relatedPaths.length !== 2 ||
      finding.relatedPaths.some(value => typeof value !== 'string' || !value.trim()) ||
      new Set(finding.relatedPaths).size !== 2)) {
    reasons.push('Opt-in sibling overlap review lacks two unique child locators');
  }
  for (const code of ['broken-image','possible-text-clipping','possible-grid-gap-anomaly','possible-sibling-overlap']) {
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

    // A review lead that remains at the SAME element path may become markedly
    // worse (or better) without appearing/disappearing. Compare the measured
    // magnitude, NOT inferred design intent. Minor font/layout subpixel jitter
    // remains below a conservative 2 CSS-px floor. A positional DOM path is an
    // observational locator, not proof that content identity is immutable.
    for (const code of ['possible-text-clipping','possible-grid-gap-anomaly','possible-sibling-overlap'] as const) {
      const existing = new Map(findAll(before, code).map(finding => [finding.path, finding]));
      const materialDelta = Math.max(2, significantPx);
      for (const finding of findAll(after, code)) {
        const original = existing.get(finding.path);
        if (!original) continue;
        if (code === 'possible-sibling-overlap' &&
            [...(original.relatedPaths ?? [])].sort().join('\0') !==
              [...(finding.relatedPaths ?? [])].sort().join('\0')) {
          unverified.push({width,reasons:[
            'Cannot compare overlapping sibling magnitudes at '+finding.path+
              ': different child pairs were observed across revisions'
          ]});
          continue;
        }
        const oldPx = original.measuredPx;
        const newPx = finding.measuredPx;
        if (!Number.isFinite(oldPx) || !Number.isFinite(newPx) ||
            oldPx! < 0 || newPx! < 0) {
          unverified.push({width,reasons:[
            'Cannot compare persisted '+code+' at '+finding.path+': numeric deviation is absent or invalid'
          ]});
          continue;
        }
        const deltaPx = newPx! - oldPx!;
        if (Math.abs(deltaPx) <= materialDelta) continue;
        const worsening = deltaPx > 0;
        add({ width,code,classification:'review',path:finding.path,
          kind:worsening?'review-worsened':'review-improved',
          baselineValue:oldPx,candidateValue:newPx,
          message:'Browser-observed '+code+' magnitude '+
            (worsening?'increased':'decreased')+' by '+Math.abs(deltaPx).toFixed(2)+
            ' CSS px ('+oldPx!.toFixed(2)+' → '+newPx!.toFixed(2)+
            ' CSS px) at the same DOM path; review whether the change is intentional'
        });
      }
    }

    for (const code of ['broken-image','possible-text-clipping','possible-grid-gap-anomaly','possible-sibling-overlap'] as const) {
      const classification = code === 'broken-image' ? 'measured' : 'review';
      const unmatched = unmatchedElementFindings(findAll(before,code), findAll(after,code), code);
      const previous = unmatched.before;
      const current = unmatched.after;
      if (previous.length && current.length) {
        // A changed DOM path is not a reliable element identity. If the count
        // increased or decreased, that aggregate change is measurable but no
        // specific moved element can honestly be blamed or cleared.
        const change = current.length - previous.length;
        if (change) add({
          width,kind:change>0 ? classification === 'measured' ? 'regression' : 'review-new'
            : classification === 'measured' ? 'improvement' : 'review-resolved',
          code,classification,baselineValue:findAll(before,code).length,
          candidateValue:findAll(after,code).length,
          message:'Count of browser-observed '+code+' changed by '+change+
            '; remaining DOM identities are ambiguous, so no exact element is attributed'
        });
        else {
          unverified.push({width,reasons:[
            'Cannot identify whether '+code+' moved or changed: unmatched DOM paths have equal counts and no unique persistent source'
          ]});
        }
        continue;
      }
      for (const item of current.sort((a,b)=>a.path!.localeCompare(b.path!))) add({
        width,kind:classification==='measured'?'regression':'review-new',
        code,classification,path:item.path,
        message:'New browser-observed '+code+' at '+item.path
      });
      for (const item of previous.sort((a,b)=>a.path!.localeCompare(b.path!))) add({
        width,kind:classification==='measured'?'improvement':'review-resolved',
        code,classification,path:item.path,
        message:'Previously observed '+code+' no longer present at '+item.path
      });
    }
    for (const code of ['pending-image','embedded-frame-uninspected','canvas-content-uninspected'] as const) {
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
      unverifiedViewports:new Set(unverified.map(item => item.width)).size,
      baselineMeasuredIssues:baseline.reduce((count,report)=>count+report.summary.errors,0),
      candidateMeasuredIssues:candidate.reduce((count,report)=>count+report.summary.errors,0)
    },
    changes,unverified,baseline:[...baseline],candidate:[...candidate]
  };
}
