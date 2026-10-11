import type { ElementGeometry, LayoutSnapshot, Rect } from './core.js';

/**
 * Check whether two captured DOM layouts agree geometrically.
 * Pure TypeScript: useful to browser adapters, CLI sampling, and agent tools.
 * No claim is made about visual styles, pixels inside canvas, or unseen times.
 */
export interface GeometryStabilization {
  status: 'stable';
  stableForMs: number;
  waitedMs: number;
  samples: number;
  changesObserved: number;
  largestObservedDeltaPx: number;
  epsilonPx: number;
}

export interface GeometryDifference {
  stable: boolean;
  maxDeltaPx: number;
  changedAliases: string[];
  reasons: string[];
}

const safeDelta = (a: number | undefined, b: number | undefined): number =>
  a === undefined || b === undefined ? (a === b ? 0 : Infinity)
    : Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a - b) : Infinity;

const rectDelta = (a: Rect, b: Rect): number =>
  Math.max(safeDelta(a.x, b.x), safeDelta(a.y, b.y),
    safeDelta(a.width, b.width), safeDelta(a.height, b.height));

const elementDelta = (a: ElementGeometry, b: ElementGeometry): number => {
  let delta = rectDelta(a.rect, b.rect);
  for (const dimension of ['width', 'height'] as const) {
    delta = Math.max(delta,
      safeDelta(a.clientSize?.[dimension], b.clientSize?.[dimension]),
      safeDelta(a.scrollSize?.[dimension], b.scrollSize?.[dimension]),
      safeDelta(a.naturalSize?.[dimension], b.naturalSize?.[dimension]));
  }
  if ((a.fragments?.length ?? 0) !== (b.fragments?.length ?? 0)) return Infinity;
  for (let i = 0; i < (a.fragments?.length ?? 0); i++) {
    delta = Math.max(delta, rectDelta(a.fragments![i], b.fragments![i]));
  }
  return delta;
};

export function compareLayoutGeometry(
  before: LayoutSnapshot,
  after: LayoutSnapshot,
  tolerancePx = 0.5
): GeometryDifference {
  if (!Number.isFinite(tolerancePx) || tolerancePx < 0) {
    throw new Error('Geometry tolerance must be a finite nonnegative CSS pixel value');
  }
  const changed = new Set<string>();
  const reasons: string[] = [];
  let maxDeltaPx = 0;
  const report = (alias: string, delta: number, reason: string) => {
    if (delta <= tolerancePx) return;
    changed.add(alias);
    if (reasons.length < 8) reasons.push(reason);
    maxDeltaPx = Math.max(maxDeltaPx, delta);
  };

  report('viewport', Math.max(
    safeDelta(before.viewport.width, after.viewport.width),
    safeDelta(before.viewport.height, after.viewport.height),
    safeDelta(before.viewport.contentWidth, after.viewport.contentWidth),
    safeDelta(before.viewport.contentHeight, after.viewport.contentHeight)
  ), 'Viewport dimensions changed');
  report('document', Math.max(
    safeDelta(before.document.width, after.document.width),
    safeDelta(before.document.height, after.document.height)
  ), 'Document scroll dimensions changed');

  const aliases = new Set([...Object.keys(before.selectors), ...Object.keys(after.selectors)]);
  for (const alias of aliases) {
    const left = before.selectors[alias] ?? [];
    const right = after.selectors[alias] ?? [];
    const leftCount = before.selectorCounts?.[alias] ?? left.length;
    const rightCount = after.selectorCounts?.[alias] ?? right.length;
    if (leftCount !== rightCount || left.length !== right.length) {
      report(alias, Infinity, alias + ' element count changed');
      continue;
    }
    // Compare stable composed DOM paths, not array indices. Reordering
    // elements with unchanged boxes should not produce a false movement.
    const oldByPath = new Map(left.map(element => [element.path, element]));
    const newByPath = new Map(right.map(element => [element.path, element]));
    if (oldByPath.size !== left.length || newByPath.size !== right.length ||
        oldByPath.size !== newByPath.size) {
      report(alias, Infinity, alias + ' element identity became ambiguous');
      continue;
    }
    for (const [path, original] of oldByPath) {
      const current = newByPath.get(path);
      if (!current) {
        report(alias, Infinity, alias + ' lost element ' + path.slice(0, 120));
      } else {
        report(alias, elementDelta(original, current), alias + ' geometry changed for ' + path.slice(0, 120));
      }
    }
  }
  // Infinity denotes changed identity/count, not a pixel quantity. Keep
  // machine-readable JSON finite while preserving the explicit instability.
  return {
    stable: changed.size === 0,
    maxDeltaPx: Number.isFinite(maxDeltaPx) ? maxDeltaPx : 0,
    changedAliases: [...changed].sort(),
    reasons
  };
}

/**
 * Bounded inspection is insufficient to certify *all* matched element boxes.
 * A caller opting into geometric stabilization should reject it rather than
 * silently reporting a stable page based only on a subset.
 */
export function truncatedGeometryAliases(snapshot: LayoutSnapshot): string[] {
  return Object.entries(snapshot.selectors)
    .filter(([alias, elements]) => (snapshot.selectorCounts?.[alias] ?? elements.length) > elements.length)
    .map(([alias]) => alias);
}
