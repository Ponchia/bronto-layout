/** Pure contract evaluation. No DOM, CSS runtime, Node, automation, or framework dependency. */
export interface Rect { x: number; y: number; width: number; height: number }
export interface ElementStyles {
  display?: string; position?: string; visibility?: string; direction?: 'ltr' | 'rtl';
  overflowX?: string; overflowY?: string; boxSizing?: string;
  margin?: string; padding?: string; gap?: string; flexDirection?: string;
  gridTemplateColumns?: string; fontSize?: string; lineHeight?: string;
  objectFit?: string;
}
export interface ElementGeometry {
  path: string;
  rect: Rect;
  tag: string;
  naturalSize?: { width: number; height: number };
  objectFit?: string;
  clientSize?: { width: number; height: number };
  scrollSize?: { width: number; height: number };
  /** Individual client rectangles, useful for wrapping inline elements and multi-column content. */
  fragments?: Rect[];
  styles?: ElementStyles;
}
export interface OverflowCandidate {
  path: string;
  rect: Rect;
  /** Candidate overhang, not proof that this element caused document scrolling. */
  rightOverflow: number;
  leftOverflow: number;
  position: string;
  overflowX: string;
}
export interface LayoutSnapshot {
  viewport: { width: number; height: number; direction: 'ltr' | 'rtl'; contentWidth?: number; contentHeight?: number; deviceScaleFactor?: number; coarsePointer?: boolean; locale?: string };
  document: { width: number; height: number };
  selectors: Record<string, ElementGeometry[]>;
  /** Exact number of visible elements, even when geometry details are bounded. */
  selectorCounts?: Record<string, number>;
  /** Bounded suggestions for investigating horizontal document overflow. */
  overflowCandidates?: OverflowCandidate[];
}
export type Edge = 'left' | 'right' | 'top' | 'bottom' | 'center-x' | 'center-y' | 'inline-start' | 'inline-end';
export interface RuleBase { id: string; description?: string; tolerance?: number; minWidth?: number; maxWidth?: number }
export type LayoutRule =
  | (RuleBase & { type: 'document-overflow' })
  | (RuleBase & { type: 'align-edge'; a: string; b: string; edgeA: Edge; edgeB?: Edge })
  | (RuleBase & { type: 'centered'; element: string; in: string | 'viewport'; axis: 'x' | 'y' })
  | (RuleBase & { type: 'contained'; element: string; in: string | 'viewport'; axis?: 'x' | 'y' | 'both' })
  | (RuleBase & { type: 'non-overlapping'; a: string; b: string })
  | (RuleBase & { type: 'equal-gaps'; elements: string[]; axis: 'x' | 'y' })
  | (RuleBase & { type: 'uniform-gaps'; element: string; axis: 'x' | 'y'; laneTolerance?: number })
  | (RuleBase & { type: 'image-aspect'; element: string; tolerancePercent?: number })
  | (RuleBase & { type: 'gap-range'; a: string; b: string; axis: 'x' | 'y'; min?: number; max?: number })
  | (RuleBase & { type: 'same-size'; a: string; b: string; axis: 'width' | 'height' | 'both' })
  | (RuleBase & { type: 'size-range'; element: string; axis: 'width' | 'height'; min?: number; max?: number })
  | (RuleBase & { type: 'selector-count'; element: string; exactly?: number; min?: number; max?: number })
  | (RuleBase & { type: 'no-clipping'; element: string; axis?: 'x' | 'y' | 'both' });
export type FindingStatus = 'pass' | 'fail' | 'skip';
export interface FindingEvidence {
  alias: string;
  path: string;
  tag: string;
  rect: Rect;
  styles?: ElementStyles;
}
export interface LayoutFinding {
  id: string;
  type: LayoutRule['type'];
  status: FindingStatus;
  message: string;
  description?: string;
  expected?: number;
  measured?: number;
  deviation?: number;
  tolerance?: number;
  paths?: string[];
  /** Bounded observed geometry and computed styles, not inferred source-level causes. */
  evidence?: FindingEvidence[];
  /** Browser-derived leads for a document-overflow failure. */
  overflowCandidates?: OverflowCandidate[];
  /** Stable machine-readable codes for actionable diagnostics, not guesswork about the CSS cause. */
  code?: 'missing-selector' | 'ambiguous-selector' | 'outside-width-range' | 'measurement-unavailable' | 'constraint';
}
export interface LayoutReport {
  viewport: LayoutSnapshot['viewport'];
  summary: { passed: number; failed: number; skipped: number };
  findings: LayoutFinding[];
}
function edge(rect: Rect, kind: Edge, direction: 'ltr' | 'rtl'): number {
  switch (kind) {
    case 'left': return rect.x;
    case 'right': return rect.x + rect.width;
    case 'top': return rect.y;
    case 'bottom': return rect.y + rect.height;
    case 'center-x': return rect.x + rect.width / 2;
    case 'center-y': return rect.y + rect.height / 2;
    case 'inline-start': return direction === 'rtl' ? rect.x + rect.width : rect.x;
    case 'inline-end': return direction === 'rtl' ? rect.x : rect.x + rect.width;
  }
}
const finiteNonNegative = (n: number) => Number.isFinite(n) && n >= 0;
const within = (delta: number, tolerance: number) => delta <= tolerance + 1e-7;
function reference(s: LayoutSnapshot, alias: string): ElementGeometry | undefined {
  return s.selectors[alias]?.[0];
}
function refRect(s: LayoutSnapshot, alias: string): Rect | undefined {
  return alias === 'viewport' ? { x: 0, y: 0, width: s.viewport.contentWidth ?? s.viewport.width, height: s.viewport.contentHeight ?? s.viewport.height } : reference(s, alias)?.rect;
}
function compare(id: string, type: LayoutRule['type'], delta: number, tolerance: number, message: string, paths?: string[]): LayoutFinding {
  return { id, type, status: within(delta, tolerance) ? 'pass' : 'fail', code: 'constraint', message, deviation: delta, tolerance, paths };
}
export function evaluateLayout(s: LayoutSnapshot, rules: readonly LayoutRule[]): LayoutReport {
  const findings: LayoutFinding[] = [];
  const direction = s.viewport.direction;
  for (const rule of rules) {
    if ((rule.minWidth != null && s.viewport.width < rule.minWidth) || (rule.maxWidth != null && s.viewport.width > rule.maxWidth)) {
      findings.push({ id: rule.id, type: rule.type, status: 'skip', code: 'outside-width-range', message: 'Outside declared viewport range', description: rule.description });
      continue;
    }
    const tolerance = rule.tolerance ?? 1;
    if (!finiteNonNegative(tolerance)) throw new Error(`Invalid tolerance in rule ${rule.id}`);
    const missingOrAmbiguous = (...aliases: string[]) => {
      const absent = aliases.filter(alias => alias !== 'viewport' && !(s.selectors[alias]?.length));
      if (absent.length) {
        findings.push({ id: rule.id, type: rule.type, status: 'fail', code: 'missing-selector', description: rule.description, message: `Missing element(s): ${absent.join(', ')}` });
        return true;
      }
      const ambiguous = aliases.filter(alias => alias !== 'viewport' && (s.selectors[alias]?.length ?? 0) > 1);
      if (ambiguous.length) {
        findings.push({ id: rule.id, type: rule.type, status: 'fail', code: 'ambiguous-selector', description: rule.description, message: `Expected one element per alias; matched multiple: ${ambiguous.map(alias => `${alias} (${s.selectors[alias].length})`).join(', ')}. Use a unique selector or selector-count.` });
        return true;
      }
      return false;
    };
    const report = (finding: LayoutFinding) => findings.push({ ...finding, description: rule.description });
    if (rule.type === 'document-overflow') {
      const delta = Math.max(0, s.document.width - (s.viewport.contentWidth ?? s.viewport.width));
      const finding = compare(rule.id, rule.type, delta, tolerance, `Document extends ${delta.toFixed(2)}px beyond the viewport`);
      if (finding.status === 'fail' && s.overflowCandidates?.length) {
        finding.overflowCandidates = s.overflowCandidates;
        finding.paths = s.overflowCandidates.map(candidate => candidate.path);
      }
      report(finding);
    } else if (rule.type === 'selector-count') {
      const count = s.selectorCounts?.[rule.element] ?? s.selectors[rule.element]?.length ?? 0;
      const min = rule.exactly ?? rule.min ?? 0;
      const max = rule.exactly ?? rule.max ?? Infinity;
      const delta = Math.max(0, min - count, count - max);
      const finding = compare(rule.id, rule.type, delta, 0, `${rule.element} matched ${count} element(s); expected ${min}${max === Infinity ? '+' : min === max ? '' : `..${max}`}`, (s.selectors[rule.element] ?? []).map(x => x.path));
      finding.measured = count; report(finding);
    } else if (rule.type === 'align-edge') {
      if (missingOrAmbiguous(rule.a, rule.b)) continue;
      const a = reference(s, rule.a)!; const b = reference(s, rule.b)!;
      const ea = edge(a.rect, rule.edgeA, a.styles?.direction ?? direction);
      const eb = edge(b.rect, rule.edgeB ?? rule.edgeA, b.styles?.direction ?? direction);
      const result = compare(rule.id, rule.type, Math.abs(ea - eb), tolerance, `${rule.edgeA} of ${rule.a}: ${ea.toFixed(2)}px; ${rule.edgeB ?? rule.edgeA} of ${rule.b}: ${eb.toFixed(2)}px`, [a.path, b.path]);
      result.measured = ea; result.expected = eb; report(result);
    } else if (rule.type === 'centered') {
      if (missingOrAmbiguous(rule.element, rule.in)) continue;
      const subject = reference(s, rule.element)!; const target = refRect(s, rule.in)!;
      const axis = rule.axis === 'x' ? 'center-x' : 'center-y';
      const delta = Math.abs(edge(subject.rect, axis, direction) - edge(target, axis, direction));
      report(compare(rule.id, rule.type, delta, tolerance, `${rule.element} is ${delta.toFixed(2)}px off-center in ${rule.in}`, [subject.path]));
    } else if (rule.type === 'contained') {
      if (missingOrAmbiguous(rule.element, rule.in)) continue;
      const subject = reference(s, rule.element)!;
      const b = refRect(s, rule.in)!; const a = subject.rect;
      const dx = Math.max(0, b.x - a.x, a.x + a.width - b.x - b.width);
      const dy = Math.max(0, b.y - a.y, a.y + a.height - b.y - b.height);
      const delta = rule.axis === 'x' ? dx : rule.axis === 'y' ? dy : Math.max(dx, dy);
      report(compare(rule.id, rule.type, delta, tolerance, `${rule.element} extends ${delta.toFixed(2)}px outside ${rule.in} (${rule.axis ?? 'both'} axis)`, [subject.path]));
    } else if (rule.type === 'non-overlapping') {
      if (missingOrAmbiguous(rule.a, rule.b)) continue;
      const a = reference(s, rule.a)!; const b = reference(s, rule.b)!;
      const overlapX = Math.max(0, Math.min(a.rect.x + a.rect.width, b.rect.x + b.rect.width) - Math.max(a.rect.x, b.rect.x));
      const overlapY = Math.max(0, Math.min(a.rect.y + a.rect.height, b.rect.y + b.rect.height) - Math.max(a.rect.y, b.rect.y));
      const delta = Math.min(overlapX, overlapY);
      report(compare(rule.id, rule.type, delta, tolerance, `${rule.a} / ${rule.b} overlap: ${overlapX.toFixed(2)} × ${overlapY.toFixed(2)}px`, [a.path, b.path]));
    } else if (rule.type === 'equal-gaps') {
      if (rule.elements.length < 3) throw new Error(`Rule ${rule.id} needs >=3 elements`);
      if (missingOrAmbiguous(...rule.elements)) continue;
      const els = rule.elements.map(alias => reference(s, alias)!);
      const positions = els.map(el => ({ start: rule.axis === 'x' ? el.rect.x : el.rect.y, size: rule.axis === 'x' ? el.rect.width : el.rect.height }));
      const gaps = positions.slice(1).map((item, i) => item.start - positions[i].start - positions[i].size);
      const delta = Math.max(...gaps) - Math.min(...gaps);
      report(compare(rule.id, rule.type, delta, tolerance, `${rule.axis}-axis gaps: ${gaps.map(n => n.toFixed(2)).join(', ')}px`, els.map(el => el.path)));
    } else if (rule.type === 'uniform-gaps') {
      const elements = s.selectors[rule.element] ?? [];
      const count = s.selectorCounts?.[rule.element] ?? elements.length;
      if (count === 0) { missingOrAmbiguous(rule.element); continue; }
      if (count > elements.length) {
        report({ id: rule.id, type: rule.type, status: 'skip', code: 'measurement-unavailable',
          message: rule.element + ' matched ' + count + ' visible elements but only ' + elements.length + ' were measured' });
        continue;
      }
      const perpendicular = rule.axis === 'x' ? 'y' : 'x';
      const laneTolerance = rule.laneTolerance ?? 4;
      const lanes: { origin: number; elements: ElementGeometry[] }[] = [];
      for (const el of elements) {
        const origin = el.rect[perpendicular];
        let lane = lanes.find(item => Math.abs(item.origin - origin) <= laneTolerance);
        if (!lane) { lane = { origin, elements: [] }; lanes.push(lane); }
        lane.elements.push(el);
      }
      const gaps: number[] = [];
      const implicated = new Set<string>();
      for (const lane of lanes) {
        const ordered = lane.elements.sort((a, b) => a.rect[rule.axis] - b.rect[rule.axis]);
        for (let i = 1; i < ordered.length; i++) {
          const before = ordered[i - 1], after = ordered[i];
          const gap = after.rect[rule.axis] - (before.rect[rule.axis] + (rule.axis === 'x' ? before.rect.width : before.rect.height));
          gaps.push(gap);
          implicated.add(before.path); implicated.add(after.path);
        }
      }
      if (gaps.length < 2) {
        report({ id: rule.id, type: rule.type, status: 'skip', code: 'measurement-unavailable',
          message: rule.element + ' has fewer than two gaps in comparable visual lanes' });
        continue;
      }
      const delta = Math.max(...gaps) - Math.min(...gaps);
      const result = compare(rule.id, rule.type, delta, tolerance,
        rule.element + ' ' + rule.axis + '-axis gaps: ' + gaps.map(n => n.toFixed(2)).join(', ') + 'px across ' + lanes.length + ' lanes',
        [...implicated]);
      result.measured = delta;
      report(result);
    } else if (rule.type === 'gap-range') {
      if (missingOrAmbiguous(rule.a, rule.b)) continue;
      const a = reference(s, rule.a)!; const b = reference(s, rule.b)!;
      const gap = rule.axis === 'x' ? b.rect.x - (a.rect.x + a.rect.width) : b.rect.y - (a.rect.y + a.rect.height);
      const min = rule.min ?? 0; const max = rule.max ?? Infinity;
      const delta = Math.max(0, min - gap, gap - max);
      const result = compare(rule.id, rule.type, delta, tolerance, `${rule.axis}-axis gap ${rule.a} → ${rule.b}: ${gap.toFixed(2)}px; allowed ${min}..${Number.isFinite(max) ? max : '∞'}px`, [a.path, b.path]);
      result.measured = gap; report(result);
    } else if (rule.type === 'same-size') {
      if (missingOrAmbiguous(rule.a, rule.b)) continue;
      const a = reference(s, rule.a)!; const b = reference(s, rule.b)!;
      const diffWidth = Math.abs(a.rect.width - b.rect.width);
      const diffHeight = Math.abs(a.rect.height - b.rect.height);
      const delta = rule.axis === 'width' ? diffWidth : rule.axis === 'height' ? diffHeight : Math.max(diffWidth, diffHeight);
      const result = compare(rule.id, rule.type, delta, tolerance,
        `${rule.a}: ${a.rect.width.toFixed(2)} × ${a.rect.height.toFixed(2)}px; ${rule.b}: ${b.rect.width.toFixed(2)} × ${b.rect.height.toFixed(2)}px; ${rule.axis} difference ${delta.toFixed(2)}px`, [a.path, b.path]);
      report(result);
    } else if (rule.type === 'size-range') {
      if (missingOrAmbiguous(rule.element)) continue;
      const el = reference(s, rule.element)!;
      const size = rule.axis === 'width' ? el.rect.width : el.rect.height;
      const min = rule.min ?? 0; const max = rule.max ?? Infinity;
      const delta = Math.max(0, min - size, size - max);
      const result = compare(rule.id, rule.type, delta, tolerance,
        `${rule.element} ${rule.axis}: ${size.toFixed(2)}px; allowed ${min}..${Number.isFinite(max) ? max : '∞'}px`, [el.path]);
      result.measured = size;
      report(result);
    } else if (rule.type === 'no-clipping') {
      if (missingOrAmbiguous(rule.element)) continue;
      const el = reference(s, rule.element)!;
      if (!el.scrollSize || !el.clientSize) {
        report({ id: rule.id, type: rule.type, status: 'skip', code: 'measurement-unavailable', message: 'Client/scroll dimensions unavailable', paths: [el.path] });
        continue;
      }
      const dx = Math.max(0, el.scrollSize.width - el.clientSize.width);
      const dy = Math.max(0, el.scrollSize.height - el.clientSize.height);
      const delta = rule.axis === 'x' ? dx : rule.axis === 'y' ? dy : Math.max(dx, dy);
      report(compare(rule.id, rule.type, delta, tolerance, `${rule.element} scroll content exceeds client box by ${dx.toFixed(2)}px horizontally and ${dy.toFixed(2)}px vertically`, [el.path]));
    } else if (rule.type === 'image-aspect') {
      if (missingOrAmbiguous(rule.element)) continue;
      const el = reference(s, rule.element)!;
      if (['contain', 'cover', 'scale-down'].includes(el.objectFit ?? '')) {
        report({ id: rule.id, type: rule.type, status: 'skip', code: 'measurement-unavailable', message: `Image uses object-fit: ${el.objectFit}; outer box aspect ratio does not measure content distortion`, paths: [el.path] });
        continue;
      }
      if (!el.naturalSize?.width || !el.naturalSize?.height || el.rect.height <= 0) {
        report({ id: rule.id, type: rule.type, status: 'skip', code: 'measurement-unavailable', message: 'Image intrinsic dimensions unavailable', paths: [el.path] });
        continue;
      }
      const actual = el.rect.width / el.rect.height;
      const expected = el.naturalSize.width / el.naturalSize.height;
      const delta = Math.abs(actual - expected) / expected * 100;
      report(compare(rule.id, rule.type, delta, rule.tolerancePercent ?? 0.5, `Rendered aspect ratio ${actual.toFixed(4)}, original ${expected.toFixed(4)} (${delta.toFixed(2)}% divergence)`, [el.path]));
    }
  }
  // Only failures receive evidence; keep ordinary reports bounded for agent use.
  // Styles are *observed* from the browser, never a guessed CSS root cause.
  const available = new Map<string, FindingEvidence>();
  for (const [alias, elements] of Object.entries(s.selectors)) {
    for (const element of elements) if (!available.has(element.path)) {
      available.set(element.path, { alias, path: element.path, tag: element.tag,
        rect: { ...element.rect }, ...(element.styles ? { styles: { ...element.styles } } : {}) });
    }
  }
  for (const finding of findings) {
    if (finding.status !== 'fail' || !finding.paths?.length) continue;
    const evidence = finding.paths.slice(0, 10).map(path => available.get(path)).filter((item): item is FindingEvidence => item !== undefined);
    if (evidence.length) finding.evidence = evidence;
  }
  return {
    viewport: s.viewport,
    summary: {
      passed: findings.filter(x => x.status === 'pass').length,
      failed: findings.filter(x => x.status === 'fail').length,
      skipped: findings.filter(x => x.status === 'skip').length
    },
    findings
  };
}
