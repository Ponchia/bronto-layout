import type { LayoutSnapshot } from './core.js';
/**
 * A self-contained DOM adapter. It can be injected as a function in any Chromium tab,
 * embedded in a site, or called by another browser runner. No framework dependency.
 * Geometry is browser truth; the adapter intentionally makes no design judgments.
 */
export function captureDOMGeometry(selectors: Record<string, string>): LayoutSnapshot {
  const entries: LayoutSnapshot['selectors'] = {};
  const selectorCounts: Record<string, number> = {};
  const MAX_MEASURED_PER_ALIAS = 250;
  /** `host-selector >>> child-selector` crosses only explicitly open shadow roots. */
  function queryElements(selector: string): Element[] {
    const parts = selector.split(/\s*>>>\s*/);
    if (parts.some(part => !part.trim())) throw new Error(`Invalid deep selector: ${selector}`);
    let roots: Array<Document | ShadowRoot> = [document];
    let matches: Element[] = [];
    for (let index = 0; index < parts.length; index++) {
      matches = roots.flatMap(root => Array.from(root.querySelectorAll(parts[index])));
      if (index < parts.length - 1) {
        roots = matches.flatMap(element => element.shadowRoot ? [element.shadowRoot] : []);
      }
    }
    return matches;
  }
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
  const docWidth = Math.max(root.scrollWidth, body?.scrollWidth ?? 0);
  const overflowCandidates: NonNullable<LayoutSnapshot['overflowCandidates']> = [];
  if (docWidth > window.innerWidth + 1) {
    // A lead is not necessarily a cause. An element can visually overhang but be
    // intentionally clipped by an ancestor. Report evidence; don't accuse CSS.
    // Bound traversal and output so dense apps cannot flood an agent context.
    const walk: Element[] = [root];
    let visited = 0;
    while (walk.length && visited < 12000) {
      const element = walk.pop()!;
      visited++;
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const bounds = element.getBoundingClientRect();
      const rightOverflow = Math.max(0, bounds.right - window.innerWidth);
      const leftOverflow = Math.max(0, -bounds.left);
      if ((rightOverflow > 1 || leftOverflow > 1) && bounds.width > 0 && bounds.height > 0) {
        overflowCandidates.push({ path: domPath(element), rect: { x: bounds.x, y: bounds.y,
          width: bounds.width, height: bounds.height },
          rightOverflow, leftOverflow, position: style.position, overflowX: style.overflowX });
      }
      if (element.shadowRoot) walk.push(...Array.from(element.shadowRoot.children));
      walk.push(...Array.from(element.children));
    }
    // Prefer tighter implicated elements before broad wrappers (html/body/main).
    overflowCandidates.sort((a, b) => Math.max(b.rightOverflow, b.leftOverflow) - Math.max(a.rightOverflow, a.leftOverflow)
      || a.rect.width - b.rect.width || a.path.localeCompare(b.path));
    overflowCandidates.splice(12);
  }
  const direction = window.getComputedStyle(root).direction === 'rtl' ? 'rtl' : 'ltr';
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight, direction,
      deviceScaleFactor: window.devicePixelRatio, coarsePointer: window.matchMedia('(pointer: coarse)').matches,
      locale: Intl.DateTimeFormat().resolvedOptions().locale },
    document: { width: docWidth, height: Math.max(root.scrollHeight, body?.scrollHeight ?? 0) },
    selectors: entries, selectorCounts, ...(overflowCandidates.length ? { overflowCandidates } : {})
  };
}
