/**
 * Framework-independent bridge for geometry that is NOT a browser document.
 * A host (canvas, SVG renderer, diagram or native UI) owns measurement and
 * identity; Bronto Layout only evaluates explicitly approved relationships.
 */
import { evaluateLayout, type LayoutReport, type LayoutRule, type Rect, type LayoutSnapshot } from './core.js';
import { parseContract } from './contract.js';

export type HostCoordinateSpace = 'world' | 'screen' | 'svg';

export interface HostGeometryElement {
  /** Stable application identity, not a CSS selector or a DOM position. */
  id: string;
  /** Every measured rectangle must share the snapshot's coordinate space. */
  space: HostCoordinateSpace;
  /** Known-but-unmeasured objects must remain unverified, never become zeros. */
  measurement: 'measured' | 'unavailable';
  rect?: Rect;
}

export interface HostGeometrySnapshot {
  space: HostCoordinateSpace;
  /** Root bounds in the SAME coordinate system as elements. May have a nonzero origin. */
  root: Rect;
  /** Actual CSS-pixel viewport used ONLY for responsive rule eligibility. */
  viewport: { width: number; height: number; direction?: 'ltr' | 'rtl' };
  /** A bounded/incomplete inventory cannot certify missing elements or element counts. */
  inventoryComplete: boolean;
  elements: readonly HostGeometryElement[];
  /** Optional host revision to correlate a result with a later or earlier mutation. */
  revision?: string;
}

export interface HostLayoutContract {
  schemaVersion?: 1;
  /** Explicit, stable host IDs. Arrays support count and repeated-gap rules. */
  targets: Record<string, string | string[]>;
  rules: LayoutRule[];
}

export interface HostLayoutReport extends LayoutReport {
  source: 'host-geometry';
  space: HostCoordinateSpace;
  revision?: string;
  /** An all-skipped result is not a passing layout. */
  assessment: 'pass' | 'fail' | 'unverified';
  coverage: { targets: number; measured: number; unavailable: number; missing: number };
}

const unsupported = new Set<LayoutRule['type']>([
  'document-overflow', 'layout-stability', 'image-aspect', 'no-clipping',
]);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const validRect = (rect: Rect): boolean =>
  Number.isFinite(rect.x) && Number.isFinite(rect.y) &&
  Number.isFinite(rect.width) && Number.isFinite(rect.height) &&
  rect.width >= 0 && rect.height >= 0;

function parseHostContract(input: HostLayoutContract): HostLayoutContract {
  if (!isRecord(input) || !isRecord(input.targets) || !Array.isArray(input.rules))
    throw new Error('Invalid host layout contract: expected targets and rules');
  for (const key of Object.keys(input))
    if (!['schemaVersion', 'targets', 'rules'].includes(key))
      throw new Error('Invalid host layout contract: unsupported field ' + key);
  for (const [alias, target] of Object.entries(input.targets)) {
    if (!alias.trim() || alias === 'viewport')
      throw new Error('Invalid host layout contract: reserved or empty alias');
    const ids = typeof target === 'string' ? [target] : target;
    if (!Array.isArray(ids) || !ids.length ||
        ids.some(id => typeof id !== 'string' || !id.trim()) ||
        new Set(ids).size !== ids.length)
      throw new Error('Invalid host layout contract: targets must contain unique nonempty IDs');
  }
  // Reuse the same strict rule and alias validator as the browser contract.
  // These inert placeholders are never used as selectors or evaluated as CSS.
  parseContract({
    schemaVersion: input.schemaVersion,
    selectors: Object.fromEntries(Object.keys(input.targets).map(alias => [alias, '[data-host]'])),
    rules: input.rules,
  });
  const invalid = input.rules.find(rule => unsupported.has(rule.type));
  if (invalid) throw new Error('Host geometry cannot verify ' + invalid.type + ': ' + invalid.id);
  return input;
}

export function evaluateHostLayout(
  snapshot: HostGeometrySnapshot,
  contractInput: HostLayoutContract,
): HostLayoutReport {
  const contract = parseHostContract(contractInput);
  if (!snapshot || !['world', 'screen', 'svg'].includes(snapshot.space) ||
      snapshot.inventoryComplete !== true)
    throw new Error('Host geometry inventory is incomplete or has an unknown coordinate space');
  if (!snapshot.root || !validRect(snapshot.root) ||
      snapshot.root.width === 0 || snapshot.root.height === 0)
    throw new Error('Host root must have finite, positive dimensions');
  const viewport = snapshot.viewport;
  if (!viewport || !Number.isInteger(viewport.width) || viewport.width < 200 ||
      viewport.width > 10000 || !Number.isInteger(viewport.height) || viewport.height <= 0 ||
      (viewport.direction !== undefined && !['ltr', 'rtl'].includes(viewport.direction)))
    throw new Error('Host viewport must supply actual CSS-pixel dimensions and direction');
  if (!Array.isArray(snapshot.elements)) throw new Error('Host elements must be a complete inventory');
  const elements = new Map<string, HostGeometryElement>();
  for (const element of snapshot.elements) {
    if (!element || typeof element.id !== 'string' || !element.id.trim() || elements.has(element.id))
      throw new Error('Host element identities must be unique and nonempty');
    if (element.space !== snapshot.space)
      throw new Error('Host geometry mixed coordinate spaces: ' + element.id);
    if (element.measurement !== 'measured' && element.measurement !== 'unavailable')
      throw new Error('Unknown host measurement status: ' + element.id);
    if ((element.measurement === 'measured' && (!element.rect || !validRect(element.rect))) ||
        (element.measurement === 'unavailable' && element.rect !== undefined))
      throw new Error('Host geometry has invalid or unsupported measurements: ' + element.id);
    elements.set(element.id, element);
  }

  const selectors: LayoutSnapshot['selectors'] = {};
  const selectorCounts: Record<string, number> = {};
  let targets = 0;
  let measured = 0;
  let unavailable = 0;
  let missing = 0;
  for (const [alias, target] of Object.entries(contract.targets)) {
    const ids = typeof target === 'string' ? [target] : target;
    const found = ids.map(id => elements.get(id)).filter((el): el is HostGeometryElement => el !== undefined);
    targets += ids.length;
    missing += ids.length - found.length;
    const measuredElements = found.filter(el => el.measurement === 'measured');
    measured += measuredElements.length;
    unavailable += found.length - measuredElements.length;
    selectorCounts[alias] = found.length;
    selectors[alias] = measuredElements.map(el => ({
      path: 'host://' + snapshot.space + '/' + encodeURIComponent(el.id),
      tag: 'host',
      rect: {
        x: el.rect!.x - snapshot.root.x,
        y: el.rect!.y - snapshot.root.y,
        width: el.rect!.width,
        height: el.rect!.height,
      },
    }));
  }
  // Note: "viewport" represents the explicitly supplied root in HOST units;
  // viewport.width still represents CSS pixels when deciding responsive rules.
  const report = evaluateLayout({
    viewport: {
      width: viewport.width, height: viewport.height,
      contentWidth: snapshot.root.width, contentHeight: snapshot.root.height,
      direction: viewport.direction ?? 'ltr',
    },
    document: { width: snapshot.root.width, height: snapshot.root.height },
    selectors, selectorCounts,
  }, contract.rules);
  const unmeasuredSkips = report.findings.some(f =>
    f.status === 'skip' && f.code !== 'outside-width-range');
  return {
    ...report,
    source: 'host-geometry',
    space: snapshot.space,
    ...(snapshot.revision !== undefined ? { revision: snapshot.revision } : {}),
    assessment: report.summary.failed > 0 ? 'fail'
      : report.summary.passed === 0 || unmeasuredSkips ? 'unverified' : 'pass',
    coverage: { targets, measured, unavailable, missing },
  };
}
