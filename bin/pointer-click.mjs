/** Strict, opt-in mouse pointer input for declared browser-state checks.
 *
 * Programmatic DOM Element.click() is intentionally preserved as the older
 * `click` action. `pointer-click` adds a real Chrome viewport hit test and
 * dispatches actual CDP mouse events. This is NOT a touch/keyboard/AT audit.
 */
export async function pointerClick(cdp, selector, timeout, queryComposedElements) {
  // Selector is JSON-escaped before entering the restricted browser script;
  // arbitrary JS cannot be supplied through action JSON.
  const expression = `(async () => {
    const selector = ${JSON.stringify(selector)};
    const find = (${queryComposedElements.toString()});
    const deadline = performance.now() + ${timeout};
    let element;
    while (!(element = find(selector)[0])) {
      if (performance.now() >= deadline)
        throw new Error('Pointer target not found: ' + selector);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!element.isConnected) throw new Error('Pointer target is detached');
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility !== 'visible' ||
        style.pointerEvents === 'none' ||
        element.matches('[disabled],[aria-disabled="true"]'))
      throw new Error('Pointer target is hidden or disabled');
    for (let node = element; node; ) {
      if (Number(getComputedStyle(node).opacity) <= 0 ||
          node.hasAttribute('inert'))
        throw new Error('Pointer target is transparent or inert');
      const root = node.getRootNode();
      node = node.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
    }
    // For wrapped inline controls, select the largest intersecting client
    // rect rather than the bounding-box center of invisible whitespace.
    const vw = Math.min(innerWidth, document.documentElement.clientWidth || innerWidth);
    const vh = Math.min(innerHeight, document.documentElement.clientHeight || innerHeight);
    let best;
    for (const box of element.getClientRects()) {
      const l = Math.max(0, box.left), t = Math.max(0, box.top);
      const r = Math.min(vw, box.right), b = Math.min(vh, box.bottom);
      const area = Math.max(0, r-l) * Math.max(0, b-t);
      if (area >= 1 && (!best || area > best.area))
        best = { x:(l+r)/2, y:(t+b)/2, area };
    }
    if (!best) throw new Error('Pointer target is outside the usable viewport; declare scroll-into-view first');
    // Respect actual browser hit-testing, traversing only explicitly open
    // shadow roots. Overlay occlusion is NOT the intended target.
    let hit = document.elementFromPoint(best.x, best.y);
    for (let depth=0; hit?.shadowRoot && depth<12; depth++) {
      const deeper = hit.shadowRoot.elementFromPoint(best.x, best.y);
      if (!deeper || deeper === hit) break;
      hit = deeper;
    }
    let node = hit;
    while (node && node !== element) {
      const root = node.getRootNode();
      node = node.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
    }
    if (node !== element)
      throw new Error('Pointer target is obscured at its viewport hit point');
    return { x:best.x, y:best.y };
  })()`;

  const point = await cdp.eval(expression);
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y))
    throw new Error('Pointer hit test produced no usable Chrome coordinates');

  // Hover may reveal a menu/overlay and change hit testing. Refuse to send
  // mouse-down if the pointer no longer lands on the declared target.
  await cdp.send('Input.dispatchMouseEvent', {
    type:'mouseMoved',x:point.x,y:point.y,button:'none',buttons:0,pointerType:'mouse'
  });
  const afterHover = await cdp.eval(expression);
  if (!afterHover || Math.abs(afterHover.x-point.x)>2 ||
      Math.abs(afterHover.y-point.y)>2)
    throw new Error('Pointer target moved during hover; click cancelled');

  let pressed = false;
  try {
    await cdp.send('Input.dispatchMouseEvent', {
      type:'mousePressed',x:point.x,y:point.y,button:'left',buttons:1,
      clickCount:1,pointerType:'mouse'
    });
    pressed = true;
    await cdp.send('Input.dispatchMouseEvent', {
      type:'mouseReleased',x:point.x,y:point.y,button:'left',buttons:0,
      clickCount:1,pointerType:'mouse'
    });
    pressed = false;
  } finally {
    // Prevent a stuck mouse button if a CDP request fails after mouse-down.
    if (pressed) await cdp.send('Input.dispatchMouseEvent', {
      type:'mouseReleased',x:point.x,y:point.y,button:'left',buttons:0,
      clickCount:1,pointerType:'mouse'
    }).catch(() => {});
  }
  await cdp.eval('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
}
