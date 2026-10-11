/**
 * Summarize *observed matched* author CSS rules from Chrome DevTools Protocol.
 *
 * Matched CSS is diagnostic evidence, NOT proof that a declaration wins the
 * cascade, causes a computed dimension, or corresponds to an original Sass /
 * utility-class source line. When Chrome cannot identify a source URL, do not
 * invent one or attach misleading file-line positions.
 */
export interface CSSStyleSheetHeader {
  styleSheetId?: string;
  sourceURL?: string;
  isInline?: boolean;
}

export interface CSSProperty {
  name?: string;
  value?: string;
  disabled?: boolean;
  range?: { startLine?: number; startColumn?: number };
}

export interface CSSStyle {
  styleSheetId?: string;
  cssProperties?: CSSProperty[];
}

export interface MatchedCSSRule {
  rule?: {
    origin?: string;
    selectorList?: { text?: string };
    style?: CSSStyle;
  };
}

export interface MatchedStyles {
  matchedCSSRules?: MatchedCSSRule[];
  inlineStyle?: CSSStyle;
}

export interface CSSDeclarationLead {
  name: string;
  value: string;
  important?: boolean;
  /** One-indexed position, present only with a verified external stylesheet URL. */
  line?: number;
}

export interface CSSRuleLead {
  selector: string;
  origin: string;
  sourceKind: 'external-stylesheet' | 'inline-stylesheet' | 'element-style';
  /** External stylesheet URL only; never infer a source file path. */
  sourceUrl?: string;
  /** The HTML document hosting an inline stylesheet, when Chrome exposes it. */
  documentUrl?: string;
  declarations: CSSDeclarationLead[];
}

export interface CSSSourceSummary {
  relevantRuleCount: number;
  rules: CSSRuleLead[];
  omittedRules: number;
}

const RELEVANT = /^(?:--[\w-]+|display|position|float|clear|(?:min-|max-)?(?:width|height)|(?:margin|padding|border|gap|column-gap|row-gap)(?:-|$)|inset(?:-|$)|(?:top|left|right|bottom)$|(?:grid|flex|align|justify|place|overflow|overscroll|scroll|transform|translate|scale|rotate|contain)(?:-|$)|box-sizing$|(?:font|text|letter|word|line-height|white-space|direction|writing-mode|object-fit|object-position|aspect-ratio|visibility|opacity|z-index)(?:-|$))/i;
const MAX_RULES = 16;
const MAX_DECLARATIONS = 16;

/** Materialize bounded evidence, retaining later matched rules ahead of earlier ones. */
export function summarizeMatchedCSS(
  matched: MatchedStyles,
  headers: ReadonlyMap<string, CSSStyleSheetHeader> = new Map()
): CSSSourceSummary {
  const candidates: CSSRuleLead[] = [];

  const declarations = (style: CSSStyle | undefined, sourceUrl?: string): CSSDeclarationLead[] => {
    const unique = new Map<string, CSSDeclarationLead>();
    for (const property of style?.cssProperties ?? []) {
      if (!property.name || !RELEVANT.test(property.name) || property.disabled || typeof property.value !== 'string') continue;
      const normalizedName = property.name.toLowerCase();
      const candidate: CSSDeclarationLead = {
        name: property.name.slice(0, 100),
        value: property.value.slice(0, 180),
        ...(/\s!important\s*$/i.test(property.value) ? { important: true } : {}),
        ...(sourceUrl && Number.isInteger(property.range?.startLine) && property.range!.startLine! >= 0
          ? { line: property.range!.startLine! + 1 } : {})
      };
      const prior = unique.get(normalizedName);
      if (!prior || (prior.line === undefined && candidate.line !== undefined)) {
        unique.set(normalizedName, candidate);
      }
    }
    return [...unique.values()].slice(0, MAX_DECLARATIONS);
  };

  for (const item of matched.matchedCSSRules ?? []) {
    const rule = item.rule;
    if (!rule || !['regular', 'inspector', 'injected'].includes(rule.origin ?? '')) continue;
    const style = rule.style;
    const header = style?.styleSheetId ? headers.get(style.styleSheetId) : undefined;
    const observedUrl = header?.sourceURL?.trim();
    // Inline <style> tags can report the *HTML page* as sourceURL, but
    // their declaration ranges are stylesheet-local. Never render those
    // ranges as HTML file lines.
    const external = Boolean(observedUrl && header?.isInline === false);
    const props = declarations(style, external ? observedUrl : undefined);
    if (!props.length) continue;
    candidates.push({
      selector: (rule.selectorList?.text || '<selector unavailable>').slice(0, 240),
      origin: rule.origin || 'unknown',
      sourceKind: external ? 'external-stylesheet' : 'inline-stylesheet',
      ...(external ? { sourceUrl: observedUrl }
        : observedUrl ? { documentUrl: observedUrl } : {}),
      declarations: props
    });
  }
  const inline = declarations(matched.inlineStyle);
  if (inline.length) candidates.push({
    selector: 'element style attribute',
    origin: 'inline',
    sourceKind: 'element-style',
    declarations: inline
  });
  const relevantRuleCount = candidates.length;
  return { relevantRuleCount, rules: candidates.slice(-MAX_RULES), omittedRules: Math.max(0, relevantRuleCount - MAX_RULES) };
}
