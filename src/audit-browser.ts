import type { PageAuditObservations, ImageLead, TextClipLead, GridGapLead, SiblingOverlapLead } from './audit.js';

/**
 * Browser-native, self-contained DOM walk. Must remain closure-free so the CLI
 * can inject the function source into any Chromium tab.
 */
export function capturePageAuditObservations(
  maxElements = 18000,
  includeGridGapReview = false,
  includeSiblingOverlapReview = false
): PageAuditObservations {
  // DOM enumeration is potentially expensive on large/virtualized apps. Leave
  // the conservative 18k default in place; higher bounds require explicit CLI
  // opt-in and never imply that uninspected page surfaces are correct.
  if (!Number.isSafeInteger(maxElements) || maxElements < 1000 || maxElements > 50000)
    throw new Error('Audit DOM traversal limit must be an integer from 1000 to 50000');
  const MAX_ELEMENTS = maxElements;
  const MAX_LEADS = 16;
  const stack: Element[] = [document.documentElement];
  const brokenImages: ImageLead[] = [];
  const textClips: TextClipLead[] = [];
  const gridGapLeads: GridGapLead[] = [];
  let gridGapCount = 0;
  let gridContainersInspected = 0;
  let gridContainersOmitted = 0;
  const MAX_GRID_CANDIDATES = 120;
  const siblingOverlapLeads: SiblingOverlapLead[] = [];
  const MAX_OVERLAP_CANDIDATES = 120;
  const MAX_OVERLAP_CHILDREN = 60;
  let siblingOverlapCount = 0;
  let overlapContainersInspected = 0;
  let overlapContainersOmitted = 0;
  let visitedElements = 0;
  let visibleElements = 0;
  let totalImages = 0;
  let unloadedImages = 0;
  let brokenImageCount = 0;
  let textClipCount = 0;
  let intentionalEllipses = 0;
  let visuallyHiddenTextExcluded = 0;
  let embeddedFrames = 0;

  const escapeID = (id: string) =>
    typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/[^\w-]/g, '_');
  const pathFor = (node: Element): string => {
    // An ID is unique only within one DOM tree; separate shadow roots can
    // reuse it. Preserve the host hierarchy instead of a misleading bare ID.
    const trees: string[] = [];
    let current: Element | null = node;
    for (let depth = 0; current && depth < 8; depth++) {
      const root: Node = current.getRootNode();
      const components: string[] = [];
      for (let cursor: Element | null = current;
           cursor && components.length < 12;
           cursor = cursor.parentElement) {
        if (cursor.id) {
          components.unshift('#' + escapeID(cursor.id).slice(0, 150));
          break;
        }
        const tag = cursor.tagName.toLowerCase();
        const cls = cursor.classList?.[0];
        let index = 1;
        for (let sibling = cursor.previousElementSibling; sibling;
             sibling = sibling.previousElementSibling) {
          if (sibling.tagName === cursor.tagName) index++;
        }
        components.unshift(tag + (cls ? '.' + escapeID(cls).slice(0, 55) : '') +
          ':nth-of-type(' + index + ')');
      }
      trees.unshift(components.join(' > '));
      current = root instanceof ShadowRoot ? root.host : null;
    }
    // A diagnostic composed locator, not a flat CSS selector.
    return trees.join(' >>> ').slice(-450);
  };
  const sanitizedSource = (img: HTMLImageElement) => {
    const raw = img.currentSrc || img.src || '';
    if (!raw) return '';
    if (raw.startsWith('data:')) return '[embedded data image]';
    if (raw.startsWith('blob:')) return '[blob URL]';
    try {
      const u = new URL(raw, location.href);
      return (u.protocol === 'http:' || u.protocol === 'https:') ?
        (u.origin + u.pathname).slice(0, 300) : '[local image]';
    } catch { return '[unparseable URL]'; }
  };

  while (stack.length && visitedElements < MAX_ELEMENTS) {
    const el = stack.pop()!;
    visitedElements++;
    const style = getComputedStyle(el);
    // display: contents has no own rectangle, but its descendants still render.
    // visibility: hidden can also be overridden by visible descendants.
    if (style.display === 'none') continue;
    if (el.shadowRoot) stack.push(...Array.from(el.shadowRoot.children));
    stack.push(...Array.from(el.children));
    if (style.visibility === 'hidden' || style.visibility === 'collapse') continue;
    const rect = el.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0) || !el.getClientRects().length) continue;
    visibleElements++;
    if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') embeddedFrames++;
    // Optional, conservative, bounded review of directly declared CSS grid
    // column gaps. Not an automatic design verdict: intentional transforms,
    // spans, dense placement, etc. are not reliably inferable from rectangles.
    if (includeGridGapReview && style.display === 'grid' && el.children.length >= 3) {
      if (gridContainersInspected >= MAX_GRID_CANDIDATES) gridContainersOmitted++;
      else {
        gridContainersInspected++;
        const justified = ['space-between', 'space-around', 'space-evenly'];
        const declared = Number.parseFloat(style.columnGap);
        if (el.children.length > 80) gridContainersOmitted++;
        else if (Number.isFinite(declared) && declared >= 0 &&
            !justified.includes(style.justifyContent)) {
          const cells: Array<{ x: number; y: number; right: number; width: number; height: number }> = [];
          for (const child of Array.from(el.children)) {
            const cs = getComputedStyle(child);
            if (cs.display === 'none' || cs.visibility === 'hidden' ||
                cs.position === 'absolute' || cs.position === 'fixed') continue;
            const r = child.getBoundingClientRect();
            if (r.width >= 8 && r.height >= 8) cells.push({
              x:r.x, y:r.y, right:r.right, width:r.width, height:r.height
            });
          }
          const rows: typeof cells[] = [];
          for (const cell of cells) {
            let row = rows.find(items => items.length > 0 &&
              Math.abs(items[0].y - cell.y) <= 2 &&
              Math.abs(items[0].height - cell.height) <= 2 &&
              Math.abs(items[0].width - cell.width) <= 2);
            if (!row) { row = []; rows.push(row); }
            row.push(cell);
          }
          for (const row of rows) {
            if (row.length < 3) continue;
            row.sort((a,b)=>a.x-b.x);
            const gaps = row.slice(1).map((item,i)=>item.x-row[i].right);
            if (gaps.some(g=>g < -0.5)) continue; // overlap requires separate review semantics
            const maxDiff = Math.max(...gaps.map(g=>Math.abs(g-declared)));
            const range = Math.max(...gaps)-Math.min(...gaps);
            if (maxDiff <= Math.max(5, declared * .25) || range <= 6) continue;
            gridGapCount++;
            if (gridGapLeads.length < MAX_LEADS) gridGapLeads.push({
              path:pathFor(el), expectedGapPx:declared,
              observedGapsPx:gaps.slice(0,20).map(x=>Number(x.toFixed(2))),
              maxDeviationPx:maxDiff, itemCount:row.length
            });
            break; // one review lead per grid container, not a flood per row
          }
        }
      }
    }
    // Opt-in only: two *direct* children of a flex/grid layout occupy
    // substantially intersecting axis-aligned boxes. This is a geometric
    // lead, NOT proof of paint-layer occlusion, intent, or a CSS root cause.
    if (includeSiblingOverlapReview &&
        ['flex', 'inline-flex', 'grid', 'inline-grid'].includes(style.display) &&
        el.children.length >= 2) {
      if (overlapContainersInspected >= MAX_OVERLAP_CANDIDATES) {
        overlapContainersOmitted++;
      } else {
        overlapContainersInspected++;
        if (el.children.length > MAX_OVERLAP_CHILDREN) {
          overlapContainersOmitted++;
        } else {
          const boxes: Array<{ el: Element; rect: DOMRect }> = [];
          for (const child of Array.from(el.children)) {
            const childStyle = getComputedStyle(child);
            if (childStyle.display === 'none' ||
                childStyle.visibility === 'hidden' ||
                childStyle.visibility === 'collapse' ||
                ['absolute', 'fixed', 'sticky'].includes(childStyle.position)) continue;
            // Negative margins often express intentionally overlapping avatars,
            // badges, etc. Do not infer their intended visual composition.
            if ([childStyle.marginLeft, childStyle.marginRight,
                 childStyle.marginTop, childStyle.marginBottom].some(value =>
                Number.parseFloat(value) < -0.5)) continue;
            const childRect = child.getBoundingClientRect();
            if (childRect.width >= 24 && childRect.height >= 24 &&
                Number.isFinite(childRect.x) && Number.isFinite(childRect.y) &&
                Number.isFinite(childRect.right) && Number.isFinite(childRect.bottom)) {
              boxes.push({ el: child, rect: childRect });
            }
          }
          let found = false;
          for (let i = 0; i < boxes.length && !found; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
              const first = boxes[i].rect, second = boxes[j].rect;
              const width = Math.min(first.right, second.right) - Math.max(first.left, second.left);
              const height = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
              // Tiny edge contact and font rounding are common and unhelpful.
              if (width < 5 || height < 5) continue;
              const area = width * height;
              const smaller = Math.min(first.width * first.height, second.width * second.height);
              const fraction = area / smaller;
              if (area < 200 || fraction < 0.12) continue;
              siblingOverlapCount++;
              if (siblingOverlapLeads.length < MAX_LEADS) siblingOverlapLeads.push({
                path: pathFor(el),
                children: [pathFor(boxes[i].el), pathFor(boxes[j].el)],
                overlapWidthPx: Number(width.toFixed(2)),
                overlapHeightPx: Number(height.toFixed(2)),
                overlapAreaPx: Number(area.toFixed(2)),
                overlapFraction: Number(fraction.toFixed(4)),
                overlapExtentPx: Number(Math.min(width, height).toFixed(2))
              });
              found = true; // One lead per layout parent; no pair explosion.
              break;
            }
          }
        }
      }
    }
    if (el instanceof HTMLImageElement) {
      const src = el.getAttribute('src') || el.getAttribute('srcset') || el.currentSrc;
      if (src) {
        totalImages++;
        if (!el.complete) unloadedImages++;
        else if (el.naturalWidth === 0 || el.naturalHeight === 0) {
          brokenImageCount++;
          if (brokenImages.length < MAX_LEADS) brokenImages.push({
            path: pathFor(el), source: sanitizedSource(el),
            width: rect.width, height: rect.height
          });
        }
      }
    }
    if (el.children.length === 0 &&
        (style.overflowX === 'hidden' || style.overflowX === 'clip') &&
        el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2 &&
        (el.textContent?.trim().length ?? 0) > 0) {
      // Visually hidden, screen-reader-only text is commonly a 1x1 absolute
      // box with clipped overflow. The overflowing label is its purpose,
      // not a visual truncation defect. Rely on geometry/style, not class names.
      const assistiveOnly = rect.width <= 2 && rect.height <= 2 &&
        (style.position === 'absolute' || style.position === 'fixed') &&
        (style.overflowX === 'hidden' || style.overflowX === 'clip');
      if (assistiveOnly) visuallyHiddenTextExcluded++;
      else if (style.textOverflow === 'ellipsis') intentionalEllipses++;
      else {
        textClipCount++;
        if (textClips.length < MAX_LEADS) textClips.push({
          path: pathFor(el), overflowPx: el.scrollWidth - el.clientWidth,
          clientWidth: el.clientWidth, scrollWidth: el.scrollWidth,
          overflowStyle: style.overflowX
        });
      }
    }
  }
  const truncated = stack.length > 0;
  return {
    visitedElements, traversalLimit: MAX_ELEMENTS, truncated,
    visibleElements, totalImages, unloadedImages,
    brokenImageCount, brokenImages,
    omittedBrokenImages: Math.max(0, brokenImageCount - brokenImages.length),
    textClipCount, textClips,
    omittedTextClips: Math.max(0, textClipCount - textClips.length),
    intentionalEllipses, visuallyHiddenTextExcluded, embeddedFrames,
    ...(includeGridGapReview ? {
      gridGapCount, gridGapLeads, gridContainersInspected, gridContainersOmitted
    } : {}),
    ...(includeSiblingOverlapReview ? {
      siblingOverlapCount, siblingOverlapLeads,
      overlapContainersInspected, overlapContainersOmitted
    } : {})
  };
}
