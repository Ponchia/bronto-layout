import type { LayoutSnapshot } from './core.js';
import { queryComposedElements } from './composed-selector.js';
/**
 * A browser DOM adapter. It can be injected with queryComposedElements in Chromium,
 * embedded in a site, or called by another browser runner. No framework dependency.
 * Geometry is browser truth; the adapter intentionally makes no design judgments.
 */
export function captureDOMGeometry(
  selectors: Record<string, string>, queryElements: (selector: string) => Element[] = queryComposedElements
): LayoutSnapshot {
  const entries: LayoutSnapshot['selectors'] = {};
  const selectorCounts: Record<string, number> = {};
  const MAX_MEASURED_PER_ALIAS = 250;
  function domPath(el: Element): string {
    const chunks: string[] = [];
    let cursor: Element | null = el;
    // Include each host to avoid collisions between identical ids in different shadow trees.
    while (cursor) {
      const segments: string[] = [];
      const root: Node = cursor.getRootNode();
      for (let node: Element | null = cursor; node && segments.length < 12; node = node.parentElement) {
        if (node.id) { segments.unshift(`#${CSS.escape(node.id)}`); break; }
        const tag = node.tagName.toLowerCase();
        let pos = 1;
        for (let sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) {
          if (sib.tagName === node.tagName) pos++;
        }
        segments.unshift(`${tag}:nth-of-type(${pos})`);
        if (tag === 'html') break;
      }
      chunks.unshift(segments.join(' > '));
      cursor = root instanceof ShadowRoot ? root.host : null;
    }
    return chunks.join(' >>> ');
  }
  for (const [alias, selector] of Object.entries(selectors)) {
    if (alias === 'viewport') throw new Error('"viewport" is a reserved alias');
    const nodes = queryElements(selector);
    const visible = nodes.filter(el => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && el.getClientRects().length > 0;
    });
    selectorCounts[alias] = visible.length;
    entries[alias] = visible.slice(0, MAX_MEASURED_PER_ALIAS).map(el => {
      const r = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const image = el instanceof HTMLImageElement ? el : null;
      return {
        path: domPath(el), tag: el.tagName.toLowerCase(),
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        fragments: Array.from(el.getClientRects()).slice(0, 20).map(fragment => ({
          x: fragment.x, y: fragment.y, width: fragment.width, height: fragment.height
        })),
        clientSize: { width: el.clientWidth, height: el.clientHeight },
        scrollSize: { width: el.scrollWidth, height: el.scrollHeight },
        styles: {
          display: style.display, position: style.position, visibility: style.visibility,
          direction: style.direction === 'rtl' ? 'rtl' : 'ltr',
          overflowX: style.overflowX, overflowY: style.overflowY,
          boxSizing: style.boxSizing, margin: style.margin, padding: style.padding,
          gap: style.gap, flexDirection: style.flexDirection, gridTemplateColumns: style.gridTemplateColumns,
          fontSize: style.fontSize, lineHeight: style.lineHeight,
          ...(image ? { objectFit: style.objectFit } : {})
        },
        ...(image ? { objectFit: style.objectFit, naturalSize: { width: image.naturalWidth, height: image.naturalHeight } } : {})
      };
    });
  }
  const root = document.documentElement;
  const body = document.body;
  const scrollportWidth = root.clientWidth || window.innerWidth;
  const scrollportHeight = root.clientHeight || window.innerHeight;
  const docWidth = Math.max(root.scrollWidth, body?.scrollWidth ?? 0);
  const direction = window.getComputedStyle(root).direction === 'rtl' ? 'rtl' : 'ltr';
  const overflowCandidates: NonNullable<LayoutSnapshot['overflowCandidates']> = [];
  let overflowCandidatesTruncated = false;
  function parentOrShadowHost(element: Element): Element | null {
    if (element.parentElement) return element.parentElement;
    const tree = element.getRootNode();
    return tree instanceof ShadowRoot ? tree.host : null;
  }
  function clippedByContainedAncestor(element: Element): boolean {
    // Nested code/content can extend hundreds of CSS px inside a local
    // horizontal scroller without causing that much ROOT overflow. The
    // clipping ancestor itself remains a candidate if its box exceeds the
    // viewport by 10px (e.g. a minimum-width body on a scrollbar viewport).
    // Do not suppress position:fixed/absolute elements: those may escape
    // an ancestor's containing or clipping context, so keep them as leads.
    const position = window.getComputedStyle(element).position;
    if (position === 'fixed' || position === 'absolute') return false;
    for (let ancestor = parentOrShadowHost(element);
      ancestor && ancestor !== root && ancestor !== body;
      ancestor = parentOrShadowHost(ancestor)) {
      const overflowX = window.getComputedStyle(ancestor).overflowX;
      if (overflowX === 'auto' || overflowX === 'scroll' ||
          overflowX === 'hidden' || overflowX === 'clip') return true;
    }
    return false;
  }
  if (docWidth > scrollportWidth + 1) {
    // A lead is not necessarily a cause. An element can visually overhang but be
    // intentionally clipped by an ancestor. Report evidence; don't accuse CSS.
    // Bound traversal and output so dense apps cannot flood an agent context.
    const walk: Element[] = [root];
    const WALK_LIMIT = 12000;
    let pendingTruncated = false;
    const enqueueChildren = (parent: Element | ShadowRoot) => {
      for (let child=parent.firstElementChild; child; child=child.nextElementSibling) {
        if (walk.length >= WALK_LIMIT) { pendingTruncated = true; break; }
        walk.push(child);
      }
    };
    let visited = 0;
    while (walk.length && visited < WALK_LIMIT) {
      const element = walk.pop()!;
      visited++;
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const bounds = element.getBoundingClientRect();
      const rightOverflow = Math.max(0, bounds.right - scrollportWidth);
      const leftOverflow = Math.max(0, -bounds.left);
      if ((rightOverflow > 1 || leftOverflow > 1) &&
          bounds.width > 0 && bounds.height > 0 &&
          !clippedByContainedAncestor(element)) {
        overflowCandidates.push({ path: domPath(element), rect: { x: bounds.x, y: bounds.y,
          width: bounds.width, height: bounds.height },
          rightOverflow, leftOverflow, position: style.position, overflowX: style.overflowX });
      }
      if (element.shadowRoot) enqueueChildren(element.shadowRoot);
      enqueueChildren(element);
    }
    overflowCandidatesTruncated = pendingTruncated || walk.length > 0;
    // Root scrollWidth excess normally extends the document's inline-end
    // edge. An intentionally translated, fixed offscreen menu on the
    // opposite side can overhang by hundreds of pixels without accounting
    // for a measured 10px inline-end root width excess. Prioritize the
    // inline-end excess, then keep other-side candidates as fallback.
    const inlineEnd = (lead: (typeof overflowCandidates)[number]) =>
      direction === 'rtl' ? lead.leftOverflow : lead.rightOverflow;
    const inlineStart = (lead: (typeof overflowCandidates)[number]) =>
      direction === 'rtl' ? lead.rightOverflow : lead.leftOverflow;
    overflowCandidates.sort((a, b) => inlineEnd(b) - inlineEnd(a)
      || inlineStart(b) - inlineStart(a)
      || a.rect.width - b.rect.width || a.path.localeCompare(b.path));
    overflowCandidates.splice(12);
  }
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight, contentWidth: scrollportWidth, contentHeight: scrollportHeight, direction,
      scrollX: window.scrollX, scrollY: window.scrollY,
      deviceScaleFactor: window.devicePixelRatio, coarsePointer: window.matchMedia('(pointer: coarse)').matches,
      locale: Intl.DateTimeFormat().resolvedOptions().locale,
      colorScheme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches },
    document: {
      width: docWidth, height: Math.max(root.scrollHeight, body?.scrollHeight ?? 0),
      rootOverflowX: window.getComputedStyle(root).overflowX,
      ...(body ? { bodyOverflowX: window.getComputedStyle(body).overflowX } : {})
    },
    selectors: entries, selectorCounts, ...(overflowCandidates.length ? { overflowCandidates } : {}),
    ...(overflowCandidatesTruncated ? { overflowCandidatesTruncated } : {})
  };
}
