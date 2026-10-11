import type { PageAuditObservations, ImageLead, TextClipLead } from './audit.js';

/**
 * Browser-native, self-contained DOM walk. Must remain closure-free so the CLI
 * can inject the function source into any Chromium tab.
 */
export function capturePageAuditObservations(): PageAuditObservations {
  const MAX_ELEMENTS = 18000;
  const MAX_LEADS = 16;
  const stack: Element[] = [document.documentElement];
  const brokenImages: ImageLead[] = [];
  const textClips: TextClipLead[] = [];
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
    intentionalEllipses, visuallyHiddenTextExcluded, embeddedFrames
  };
}
