/** Browser-native, deliberately conservative selector discovery.
 * Executed inside the inspected document: no imports, I/O, or dependencies.
 * Unstable/ambiguous DOM paths are not silently turned into durable selectors.
 */
export interface SelectorDiscovery {
  selectors: Record<string, string>;
  groupAliases: string[];
  inspectedCandidates: number;
  candidatesTruncated: boolean;
  limitations: string[];
}
export function discoverPageSelectors(): SelectorDiscovery {
  const MAX_CANDIDATES = 500;
  const MAX_SINGLE = 20;
  const MAX_GROUP = 6;
  const selectors: Record<string, string> = {};
  const groupAliases: string[] = [];
  const considered = document.querySelectorAll(
    'main,header,nav,footer,aside,h1,h2,section,article,figure,form,[data-testid],[id],.gallery,.grid'
  );
  const cssEscape = (value: string) => CSS.escape(value);
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return r.width >= 8 && r.height >= 8 && style.display !== 'none' &&
      style.visibility !== 'hidden' && el.getClientRects().length > 0;
  };
  const simpleSelector = (el: Element): string | undefined => {
    if (el.id && el.id.length <= 70) {
      const candidate = '#' + cssEscape(el.id);
      if (document.querySelectorAll(candidate).length === 1) return candidate;
    }
    const testid = el.getAttribute('data-testid');
    if (testid && testid.length <= 70) {
      const candidate = '[data-testid=' + JSON.stringify(testid) + ']';
      if (document.querySelectorAll(candidate).length === 1) return candidate;
    }
    const tag = el.tagName.toLowerCase();
    if (document.querySelectorAll(tag).length === 1) return tag;
    for (const className of Array.from(el.classList).slice(0, 3)) {
      if (className.length > 50 || /^[a-f0-9_-]{8,}$/i.test(className)) continue;
      const candidate = tag + '.' + cssEscape(className);
      if (document.querySelectorAll(candidate).length === 1) return candidate;
    }
    return undefined;
  };
  const aliasFor = (element: Element, prefix = '') => {
    const source = element.id || element.getAttribute('data-testid') ||
      element.classList[0] || element.tagName.toLowerCase();
    const base = (prefix + source).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 60);
    let alias = base || 'element';
    let index = 2;
    while (alias === 'viewport' || Object.hasOwn(selectors, alias)) alias = base + '-' + index++;
    return alias;
  };
  for (const el of Array.from(considered).slice(0, MAX_CANDIDATES)) {
    if (Object.keys(selectors).length >= MAX_SINGLE) break;
    if (!visible(el)) continue;
    const selector = simpleSelector(el);
    if (!selector || Object.values(selectors).includes(selector)) continue;
    selectors[aliasFor(el)] = selector;
  }
  // Repeated direct siblings make a useful provisional spacing group. Do not
  // infer groups from arbitrary descendants or use ambiguous parent selectors.
  for (const el of Array.from(considered).slice(0, MAX_CANDIDATES)) {
    if (groupAliases.length >= MAX_GROUP) break;
    const parent = simpleSelector(el);
    if (!parent || !visible(el)) continue;
    const counts = new Map<string, number>();
    for (const child of Array.from(el.children).slice(0, 80)) {
      if (!visible(child)) continue;
      for (const className of Array.from(child.classList).slice(0, 3)) {
        if (className.length <= 40 && !/^[a-f0-9_-]{8,}$/i.test(className))
          counts.set(className, (counts.get(className) || 0) + 1);
      }
    }
    for (const [name, count] of counts) {
      if (count < 3 || groupAliases.length >= MAX_GROUP) continue;
      const selector = parent + ' > .' + cssEscape(name);
      if (document.querySelectorAll(selector).length !== count ||
          Object.values(selectors).includes(selector)) continue;
      const alias = aliasFor(el, 'group-' + name + '-');
      selectors[alias] = selector;
      groupAliases.push(alias);
    }
  }
  return {
    selectors, groupAliases,
    inspectedCandidates: Math.min(considered.length, MAX_CANDIDATES),
    candidatesTruncated: considered.length > MAX_CANDIDATES,
    limitations: [
      'Only unique, simple selectors and repeated direct siblings are proposed',
      'Auto-discovery does not enter shadow roots, iframes, canvas or WebGL',
      'Selectors may become invalid after DOM or content changes: review before acceptance'
    ]
  };
}
