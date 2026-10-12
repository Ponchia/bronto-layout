/** Browser-native, deliberately conservative selector discovery.
 * Executed inside the inspected document: no imports, I/O, or dependencies.
 * Unstable/ambiguous DOM paths are not silently turned into durable selectors.
 */
export interface SelectorDiscovery {
  selectors: Record<string, string>;
  groupAliases: string[];
  inspectedCandidates: number;
  candidatesTruncated: boolean;
  /** Which discovery limits prevented inspecting additional candidates. */
  limitReasons: Array<'candidate-limit' | 'unique-selector-limit' | 'repeated-group-limit'>;
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
  // Avoid materializing every matching element in a second unbounded JS array.
  const candidates = Array.from({ length: Math.min(considered.length, MAX_CANDIDATES) },
    (_, index) => considered.item(index)!);
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
  let singlesInspected = 0;
  for (const el of candidates) {
    if (Object.keys(selectors).length >= MAX_SINGLE) break;
    singlesInspected++;
    if (!visible(el)) continue;
    const selector = simpleSelector(el);
    if (!selector || Object.values(selectors).includes(selector)) continue;
    selectors[aliasFor(el)] = selector;
  }
  // Repeated direct siblings make a useful provisional spacing group. Do not
  // infer groups from arbitrary descendants or use ambiguous parent selectors.
  let groupParentsInspected = 0;
  let groupsOmittedAtLimit = false;
  for (const el of candidates) {
    if (groupAliases.length >= MAX_GROUP) break;
    groupParentsInspected++;
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
      if (count < 3) continue;
      if (groupAliases.length >= MAX_GROUP) { groupsOmittedAtLimit = true; break; }
      const selector = parent + ' > .' + cssEscape(name);
      if (document.querySelectorAll(selector).length !== count ||
          Object.values(selectors).includes(selector)) continue;
      const alias = aliasFor(el, 'group-' + name + '-');
      selectors[alias] = selector;
      groupAliases.push(alias);
    }
  }
  const limitReasons: SelectorDiscovery['limitReasons'] = [];
  if (considered.length > MAX_CANDIDATES) limitReasons.push('candidate-limit');
  if (singlesInspected < candidates.length) limitReasons.push('unique-selector-limit');
  if (groupParentsInspected < candidates.length || groupsOmittedAtLimit)
    limitReasons.push('repeated-group-limit');
  return {
    selectors, groupAliases,
    inspectedCandidates: candidates.length,
    candidatesTruncated: limitReasons.length > 0, limitReasons,
    limitations: [
      'Only unique, simple selectors and repeated direct siblings are proposed',
      'Auto-discovery does not enter shadow roots, iframes, canvas or WebGL',
      'Selectors may become invalid after DOM or content changes: review before acceptance'
    ]
  };
}
