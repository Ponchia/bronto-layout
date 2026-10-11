/**
 * Translate CSS media-query thresholds reported by a browser into nearby integer
 * viewport widths. This module is intentionally independent of CDP and Node.
 *
 * A threshold by itself says nothing about layout correctness: generated widths
 * are sampling suggestions, NOT assertions. Ranges without a status change can
 * still contain defects due to JavaScript, container queries, or other states.
 */
export interface CSSMediaExpression {
  feature?: string;
  value?: number;
  unit?: string;
  computedLength?: number;
}
export interface CSSMediaQuery {
  expressions?: CSSMediaExpression[];
}
export interface CSSMedia {
  text?: string;
  mediaList?: CSSMediaQuery[];
}
export interface CSSBreakpointSamples {
  thresholds: number[];
  widths: number[];
}

/** The renderer may resolve rem/em units into CSS pixels in computedLength. */
function widthExpressionPixels(expression: CSSMediaExpression): number | undefined {
  if (!/^(min-width|max-width|width)$/i.test(expression.feature ?? '')) return undefined;
  const computed = expression.computedLength;
  if (typeof computed === 'number' && Number.isFinite(computed) && computed >= 0) return computed;
  if (expression.unit?.toLowerCase() === 'px' &&
      typeof expression.value === 'number' && Number.isFinite(expression.value) && expression.value >= 0) {
    return expression.value;
  }
  return undefined;
}

export function mediaBreakpointSamples(
  medias: readonly CSSMedia[], minWidth: number, maxWidth: number, maxBreakpoints = 64
): CSSBreakpointSamples {
  if (!Number.isInteger(minWidth) || !Number.isInteger(maxWidth) || minWidth < 200 ||
      maxWidth > 10000 || minWidth > maxWidth || !Number.isSafeInteger(maxBreakpoints) || maxBreakpoints < 1) {
    throw new Error('Invalid CSS breakpoint sampling range or limit');
  }
  const thresholds = new Set<number>();
  for (const media of medias) {
    let structuredWidthFound = false;
    for (const query of media.mediaList ?? []) {
      for (const expression of query.expressions ?? []) {
        const value = widthExpressionPixels(expression);
        if (value === undefined) continue;
        structuredWidthFound = true;
        if (value >= minWidth - 2 && value <= maxWidth + 2) thresholds.add(value);
      }
    }
    // Older CDP builds may return text without parsed mediaList expressions.
    // Only literal px values are safe to parse ourselves: do not guess rem/em.
    if (!structuredWidthFound && media.text) {
      for (const match of media.text.matchAll(/\b(?:min-width|max-width|width)\s*:\s*(\d+(?:\.\d+)?)px\b/gi)) {
        const value = Number(match[1]);
        if (value >= minWidth - 2 && value <= maxWidth + 2) thresholds.add(value);
      }
    }
  }
  if (thresholds.size > maxBreakpoints) {
    throw new Error(`Discovered ${thresholds.size} CSS width thresholds (limit ${maxBreakpoints}); narrow --scan range`);
  }
  const sorted = [...thresholds].sort((a, b) => a - b);
  const widths = new Set<number>();
  for (const threshold of sorted) {
    // Test either side of fractional boundaries such as 767.98px.
    for (const width of [Math.floor(threshold) - 1, Math.floor(threshold),
      Math.ceil(threshold), Math.ceil(threshold) + 1]) {
      if (width >= minWidth && width <= maxWidth) widths.add(width);
    }
  }
  return { thresholds: sorted, widths: [...widths].sort((a, b) => a - b) };
}

export function combineCSSBreakpointSamples(
  coarseWidths: readonly number[], ...sources: readonly CSSBreakpointSamples[]
): { widths: number[]; thresholds: number[]; addedWidths: number[] } {
  const coarse = new Set(coarseWidths);
  const merged = new Set<number>(coarseWidths);
  const thresholds = new Set<number>();
  for (const source of sources) {
    for (const threshold of source.thresholds) thresholds.add(threshold);
    for (const width of source.widths) merged.add(width);
  }
  return {
    widths: [...merged].sort((a, b) => a - b),
    thresholds: [...thresholds].sort((a, b) => a - b),
    addedWidths: [...merged].filter(width => !coarse.has(width)).sort((a, b) => a - b)
  };
}
