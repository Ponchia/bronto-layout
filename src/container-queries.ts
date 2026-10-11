/**
 * Browser-native CSS container-query evidence, deliberately not a stylesheet
 * evaluator or an assertion about which rules are active for a target element.
 *
 * This function is self-contained and can be stringified into Chromium's
 * Runtime.evaluate. It is separate from the Node-free layout contract engine.
 */
export interface ContainerWidthCandidate {
  feature: 'width' | 'inline-size' | 'height' | 'block-size';
  comparator: 'min' | 'max' | '<' | '<=' | '>' | '>=' | '=';
  /** Declared CSS numeric threshold, unconverted for relative units. */
  value: number;
  unit: 'px' | 'rem' | 'em';
  /** Only absolute CSS px declarations receive a numerical px threshold. */
  valuePx?: number;
}
export interface ContainerQueryRuleEvidence {
  name: string;
  query: string;
  conditionText: string;
  sourceKind: 'external-stylesheet' | 'inline-stylesheet' | 'unknown';
  sourceUrl?: string;
  candidatePxThresholds: ContainerWidthCandidate[];
}
export interface ContainerGeometryLead {
  name: string;
  type: string;
  path: string;
  width: number;
  height: number;
}
export interface ContainerQueryEvidence {
  supported: boolean;
  stylesheetsSeen: number;
  stylesheetsInaccessible: number;
  rulesVisited: number;
  discoveredRules: number;
  discoveredConditions: number;
  omittedConditions: number;
  rulesTruncated: boolean;
  rules: ContainerQueryRuleEvidence[];
  containerElementsVisited: number;
  namedOrSizedContainers: number;
  omittedContainers: number;
  containersTruncated: boolean;
  containers: ContainerGeometryLead[];
  /** These are declared query thresholds, not viewport breakpoints. */
  note: string;
}

export function captureContainerQueryEvidence(): ContainerQueryEvidence {
  const MAX_RULE_WALK = 4000;
  const MAX_QUERIES = 80;
  const MAX_ELEMENTS = 12000;
  const MAX_CONTAINERS = 80;
  const queryRules: ContainerQueryRuleEvidence[] = [];
  const containers: ContainerGeometryLead[] = [];
  let rulesVisited = 0;
  let discoveredRules = 0;
  let discoveredConditions = 0;
  let stylesheetsInaccessible = 0;
  let elementsVisited = 0;
  let namedOrSizedContainers = 0;
  const visitedStylesheets = new Set<CSSStyleSheet>();

  const safeURL = (raw: string | null | undefined) => {
    if (!raw) return undefined;
    try {
      const u = new URL(raw, location.href);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return undefined;
      // Never output authorization, query strings or fragments.
      return (u.origin + u.pathname).slice(0, 300);
    } catch { return undefined; }
  };
  const candidateThresholds = (text: string): ContainerWidthCandidate[] => {
    const results: ContainerWidthCandidate[] = [];
    const seen = new Set<string>();
    const add = (feature: string, comparator: string, value: string, unit: string) => {
      const normalized = feature.startsWith('min-') ? 'min' :
        feature.startsWith('max-') ? 'max' : comparator;
      const axis = feature.replace(/^(?:min-|max-)/, '');
      if (!['width', 'height', 'inline-size', 'block-size'].includes(axis)) return;
      if (!['px', 'rem', 'em'].includes(unit)) return;
      const number = Number(value);
      if (!Number.isFinite(number) || number < 0 || number > 100000) return;
      const key = axis + '/' + normalized + '/' + number + '/' + unit;
      if (seen.has(key)) return;
      seen.add(key);
      results.push({
        feature: axis as ContainerWidthCandidate['feature'],
        comparator: normalized as ContainerWidthCandidate['comparator'],
        value: number,
        unit: unit as ContainerWidthCandidate['unit'],
        // Relative CSS units depend on the actual query environment; do
        // not invent a pixel threshold without identifying its container.
        ...(unit === 'px' ? {valuePx: number} : {})
      });
    };
    const colon = /\(\s*(min-width|max-width|min-height|max-height|min-inline-size|max-inline-size|min-block-size|max-block-size)\s*:\s*(\d+(?:\.\d+)?)(px|rem|em)\s*\)/gi;
    for (const match of text.matchAll(colon)) add(match[1].toLowerCase(), '', match[2], match[3].toLowerCase());
    const compare = /\(\s*(width|height|inline-size|block-size)\s*(<=|>=|<|>|=)\s*(\d+(?:\.\d+)?)(px|rem|em)\s*\)/gi;
    for (const match of text.matchAll(compare)) add(match[1].toLowerCase(), match[2], match[3], match[4].toLowerCase());
    return results.slice(0, 16);
  };
  const visitStyleSheet = (sheet: CSSStyleSheet, depth: number) => {
    if (visitedStylesheets.has(sheet) || depth > 16 || rulesVisited >= MAX_RULE_WALK) return;
    visitedStylesheets.add(sheet);
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; }
    catch { stylesheetsInaccessible++; return; }
    const url = safeURL(sheet.href);
    const sourceKind = sheet.href ? 'external-stylesheet' as const : 'inline-stylesheet' as const;
    visitRules(rules, depth, url, sourceKind);
  };
  const visitRules = (
    rules: CSSRuleList, depth: number,
    sourceUrl: string | undefined,
    sourceKind: 'external-stylesheet' | 'inline-stylesheet' | 'unknown'
  ) => {
    if (depth > 16) return;
    for (const rule of Array.from(rules)) {
      if (rulesVisited++ >= MAX_RULE_WALK) break;
      if (typeof CSSContainerRule !== 'undefined' && rule instanceof CSSContainerRule) {
        discoveredRules++;
        // Newer engines expose every OR-separated condition individually;
        // old Chromium exposes only a single fallback condition.
        const latest = rule as CSSContainerRule & {
          conditions?: Array<{ name: string; query: string }>;
        };
        const conditions = latest.conditions && latest.conditions.length
          ? Array.from(latest.conditions).map(item=>({
            name:String(item.name??''),query:String(item.query??'')
          }))
          : [{
            name:String(rule.containerName??''),
            query:String(rule.containerQuery || rule.conditionText || '')
          }];
        discoveredConditions += conditions.length;
        for (const condition of conditions) {
          if (queryRules.length >= MAX_QUERIES) break;
          queryRules.push({
            name:condition.name.slice(0, 120),
            query:condition.query.slice(0, 500),
            conditionText:String(rule.conditionText||'').slice(0, 600),
            sourceKind,
            ...(sourceUrl?{sourceUrl}:{}),
            candidatePxThresholds:candidateThresholds(condition.query)
          });
        }
      }
      if (rule instanceof CSSImportRule && rule.styleSheet) {
        visitStyleSheet(rule.styleSheet,depth+1);
      }
      const grouping = rule as CSSRule & {cssRules?: CSSRuleList};
      if (grouping.cssRules) visitRules(grouping.cssRules,depth+1,sourceUrl,sourceKind);
      if (rulesVisited>=MAX_RULE_WALK) break;
    }
  };
  for (const sheet of Array.from(document.styleSheets)) visitStyleSheet(sheet,0);

  const escapeID = (input: string) =>
    typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(input) : input.replace(/[^\w-]/g,'_');
  const locator = (node: Element) => {
    if (node.id) return ('#'+escapeID(node.id)).slice(0, 200);
    const tags:string[] = [];
    let current:Element|null=node;
    for(let i=0;i<6&&current;i++){
      let position=1;
      for(let sibling=current.previousElementSibling;sibling;sibling=sibling.previousElementSibling){
        if(sibling.tagName===current.tagName)position++;
      }
      tags.unshift(current.tagName.toLowerCase()+':nth-of-type('+position+')');
      const root:Node=current.getRootNode();
      current=current.parentElement??(root instanceof ShadowRoot?root.host:null);
    }
    return tags.join(' > ').slice(-260);
  };
  const nodes:Element[]=[document.documentElement];
  while(nodes.length && elementsVisited < MAX_ELEMENTS){
    const el=nodes.pop()!;
    elementsVisited++;
    const style=getComputedStyle(el);
    if(style.display==='none')continue;
    if(el.shadowRoot)nodes.push(...Array.from(el.shadowRoot.children));
    nodes.push(...Array.from(el.children));
    if(style.visibility==='hidden'||style.visibility==='collapse')continue;
    const type=style.containerType||'normal';
    const name=style.containerName||'none';
    if((type==='normal'||type==='')&&(name==='none'||name===''))continue;
    if(!el.getClientRects().length)continue;
    namedOrSizedContainers++;
    if(containers.length>=MAX_CONTAINERS)continue;
    const rect=el.getBoundingClientRect();
    containers.push({
      name:name.slice(0,120),type:type.slice(0,80),
      path:locator(el),width:rect.width,height:rect.height
    });
  }
  return {
    supported:typeof CSSContainerRule!=='undefined',
    stylesheetsSeen:visitedStylesheets.size,
    stylesheetsInaccessible,
    rulesVisited:Math.min(rulesVisited,MAX_RULE_WALK),
    discoveredRules,
    discoveredConditions,
    omittedConditions:Math.max(0,discoveredConditions-queryRules.length),
    rulesTruncated:rulesVisited>=MAX_RULE_WALK,
    rules:queryRules,
    containerElementsVisited:elementsVisited,
    namedOrSizedContainers,
    omittedContainers:Math.max(0,namedOrSizedContainers-containers.length),
    containersTruncated:nodes.length>0,
    containers,
    note:'CSS @container rules and computed container boxes are observed, not necessarily matching a selected element. Pixel values are conditional thresholds of container dimensions, NOT guaranteed viewport breakpoints.'
  };
}
