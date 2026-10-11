import { summarizeMatchedCSS, type CSSStyleSheetHeader, type CSSSourceSummary } from './css-sources.js';
import type { LayoutSnapshot } from './core.js';

/** Structural CDP interface: no browser automation package is required. */
export interface CSSInspectorClient {
  send(method: string, params?: Record<string, unknown>): Promise<any>;
  listen(method: string, callback: (payload: any) => void): () => void;
}

export interface InspectedCSSNode extends CSSSourceSummary {
  index: number;
  tag: string;
  id?: string;
  className?: string;
  status: 'ok';
}
export interface CSSUnavailableNode {
  index: number;
  tag: string;
  status: 'unavailable';
  reason: string;
}
export interface CSSAliasInspection {
  alias: string;
  selector: string;
  matchedCount: number;
  visibleCount: number;
  inspectedCount: number;
  omittedElements: number;
  elements: Array<InspectedCSSNode | CSSUnavailableNode>;
}
export interface CSSInspection {
  width: number;
  aliases: CSSAliasInspection[];
  omittedAliases: number;
  inspectionLimit: { maxAliases: number; maxPerAlias: number; maxElements: number };
  note: string;
}

const MAX_ALIASES = 24;
const MAX_PER_ALIAS = 6;
const MAX_ELEMENTS = 48;

/**
 * Opt-in CSS cascade evidence for selected DOM elements. Nested selectors
 * traverse only declared open Shadow DOM roots. Child-frame DOMs and closed
 * shadow roots are not introspectable.
 */
export async function inspectCSSWithCDP(
  cdp: CSSInspectorClient,
  selectors: Record<string, string>,
  snapshot: LayoutSnapshot
): Promise<CSSInspection> {
  const headers = new Map<string, CSSStyleSheetHeader>();
  const unsubscribe = cdp.listen('CSS.styleSheetAdded', ({ header }: { header?: CSSStyleSheetHeader }) => {
    if (header?.styleSheetId) headers.set(header.styleSheetId, header);
  });
  await cdp.send('DOM.enable');
  try {
    try {
      await cdp.send('CSS.enable');
    } catch (error) {
      throw new Error('--css-sources requires CSS.enable support: ' + (error as Error).message);
    }
    const doc = await cdp.send('DOM.getDocument', { depth: 1, pierce: true });
    const aliases: CSSAliasInspection[] = [];
    let totalInspected = 0;
    const named = Object.entries(selectors);
    for (const [alias, selector] of named.slice(0, MAX_ALIASES)) {
      const segments = selector.split(/\s*>>>\s*/);
      if (segments.some(part => !part.trim())) throw new Error('Invalid deep selector: ' + selector);
      let roots: number[] = [doc.root.nodeId];
      let matched: number[] = [];
      for (let step = 0; step < segments.length; step++) {
        matched = [];
        for (const root of roots) {
          const response = await cdp.send('DOM.querySelectorAll', { nodeId: root, selector: segments[step] });
          matched.push(...(response.nodeIds ?? []));
        }
        if (step < segments.length - 1) {
          const nextRoots: number[] = [];
          for (const nodeId of matched) {
            const { node } = await cdp.send('DOM.describeNode', { nodeId, depth: 1, pierce: true });
            for (const shadow of node.shadowRoots ?? []) {
              if (shadow.shadowRootType === 'open' && shadow.nodeId) nextRoots.push(shadow.nodeId);
            }
          }
          roots = nextRoots;
        }
      }
      const elements: CSSAliasInspection['elements'] = [];
      const limit = Math.min(MAX_PER_ALIAS, Math.max(0, MAX_ELEMENTS - totalInspected));
      for (const [index, nodeId] of matched.slice(0, limit).entries()) {
        totalInspected++;
        const { node } = await cdp.send('DOM.describeNode', { nodeId, depth: 0, pierce: true });
        const attrs: Record<string, string> = {};
        for (let i = 0; i < (node.attributes ?? []).length; i += 2) {
          if (node.attributes[i] === 'id' || node.attributes[i] === 'class') {
            attrs[node.attributes[i]] = String(node.attributes[i + 1] ?? '').slice(0, 160);
          }
        }
        try {
          const matchedCSS = await cdp.send('CSS.getMatchedStylesForNode', { nodeId });
          elements.push({
            index, tag: node.localName,
            ...(attrs.id ? { id: attrs.id } : {}),
            ...(attrs.class ? { className: attrs.class } : {}),
            status: 'ok', ...summarizeMatchedCSS(matchedCSS, headers)
          });
        } catch (error) {
          elements.push({
            index, tag: node.localName, status: 'unavailable',
            reason: String((error as Error).message).slice(0, 240)
          });
        }
      }
      aliases.push({
        alias, selector, matchedCount: matched.length,
        visibleCount: snapshot.selectorCounts?.[alias] ?? 0,
        inspectedCount: elements.length, omittedElements: matched.length - elements.length,
        elements
      });
    }
    return {
      width: snapshot.viewport.width,
      aliases, omittedAliases: named.length - aliases.length,
      inspectionLimit: { maxAliases: MAX_ALIASES, maxPerAlias: MAX_PER_ALIAS, maxElements: MAX_ELEMENTS },
      note: 'Matched author styles are diagnostic leads, not verified cascade winners or causes'
    };
  } finally {
    unsubscribe();
    try { await cdp.send('CSS.disable'); } finally { await cdp.send('DOM.disable'); }
  }
}
