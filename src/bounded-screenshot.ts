/**
 * Plan bounded screenshot evidence from measured Chromium CSS layout metrics.
 * This is capture geometry, not a claim of complete rendering or visual intent.
 * Pure TypeScript: no DOM, Node, browser or network dependencies.
 */
export interface ScreenshotClip { x: number; y: number; width: number; height: number; scale: 1 }
export interface BoundedScreenshotPlan {
  clip: ScreenshotClip;
  documentWidth: number;
  documentHeight: number;
  capturedWidth: number;
  capturedHeight: number;
  truncatedHorizontally: boolean;
  truncatedVertically: boolean;
  coverage: 'rendered-document-rectangle' | 'bounded-top-left-rectangle';
  limits: { maxWidth: number; maxHeight: number; maxCssPixels: number };
  limitations: string[];
}

export const BOUNDED_CAPTURE_LIMITS = Object.freeze({
  maxWidth: 4096,
  maxHeight: 6000,
  maxCssPixels: 12_000_000
});

export function planBoundedScreenshot(viewportWidth: number, layoutMetrics: unknown): BoundedScreenshotPlan {
  const finitePositive = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n > 0;
  const metrics = layoutMetrics as { cssContentSize?: { width?: unknown; height?: unknown } } | null;
  const content = metrics?.cssContentSize;
  if (!finitePositive(viewportWidth) || !finitePositive(content?.width) || !finitePositive(content?.height)) {
    throw new Error('Cannot collect bounded document evidence: Chromium CSS layout metrics unavailable');
  }
  const documentWidth = Math.ceil(Math.max(viewportWidth, content!.width as number));
  const documentHeight = Math.ceil(content!.height as number);
  const { maxWidth, maxHeight, maxCssPixels } = BOUNDED_CAPTURE_LIMITS;
  const capturedWidth = Math.min(documentWidth, maxWidth);
  const heightLimit = Math.min(maxHeight, Math.floor(maxCssPixels / capturedWidth));
  const capturedHeight = Math.min(documentHeight, heightLimit);
  const truncatedHorizontally = capturedWidth < documentWidth;
  const truncatedVertically = capturedHeight < documentHeight;
  const truncated = truncatedHorizontally || truncatedVertically;
  return {
    clip: { x: 0, y: 0, width: capturedWidth, height: capturedHeight, scale: 1 },
    documentWidth, documentHeight, capturedWidth, capturedHeight,
    truncatedHorizontally, truncatedVertically,
    coverage: truncated ? 'bounded-top-left-rectangle' : 'rendered-document-rectangle',
    limits: { maxWidth, maxHeight, maxCssPixels },
    limitations: [
      'Screenshot is a single observed browser state, not proof of layout correctness',
      'Lazy-loaded images, dynamic content and offscreen interactions may not have been rendered',
      'Embedded iframe DOM, closed shadow roots and canvas internals are not automatically inspected',
      'The capture may be clipped at the top-left boundary to limit image size'
    ]
  };
}
