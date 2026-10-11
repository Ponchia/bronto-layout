export * from './core.js';
export * from './actions.js';
export * from './browser.js';
export * from './contract.js';
export * from './sweep.js';
export * from './compare.js';
export * from './sarif.js';
export * from './breakpoints.js';

export { compactCheckReport, compactCompareReport } from './agent-report.js';

export { parseBatchManifest } from './batch.js';
export type { BatchJob, BatchManifest } from './batch.js';

export { summarizeMatchedCSS } from './css-sources.js';
export type { CSSRuleLead, CSSSourceSummary } from './css-sources.js';

export { inspectCSSWithCDP } from './css-inspector.js';
export type { CSSInspection } from './css-inspector.js';

export { selectCSSFailureAliases } from './css-failure-leads.js';
export type { CSSFailureSourceLead } from './css-failure-leads.js';

export { summarizeLayoutShifts, installLayoutShiftCollector } from './layout-shifts.js';
export type { LayoutShiftSummary, ShiftEntry } from './layout-shifts.js';

export { compareLayoutGeometry, truncatedGeometryAliases } from './geometry-stability.js';
export type { GeometryDifference, GeometryStabilization } from './geometry-stability.js';

export { analyzePageAudit } from './audit.js';
export { capturePageAuditObservations } from './audit-browser.js';
export type { ViewportAudit, PageAuditObservations, AuditFinding } from './audit.js';
