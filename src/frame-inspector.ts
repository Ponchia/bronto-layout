import { summarizeFrameInventory, type FrameInventory } from './frame-inventory.js';

/** Additional CDP reads are opt-in because full DOM snapshots can be costly. */
export async function captureFrameInventoryWithCDP(cdp: {
  send: (method: string, params?: Record<string, unknown>) => Promise<any>;
}, visibleDomFrames = 0): Promise<FrameInventory> {
  const tree = await cdp.send('Page.getFrameTree');
  if (!tree?.frameTree?.frame) throw new Error('Page.getFrameTree returned no root frame');
  // A single nested child is enough to justify an additional snapshot; no
  // extra full-document traversal for ordinary frame-free pages.
  if (!tree.frameTree.childFrames?.length) return summarizeFrameInventory(tree.frameTree, undefined, visibleDomFrames);
  let snapshot;
  try {
    snapshot = await cdp.send('DOMSnapshot.captureSnapshot', {
      computedStyles: [], includePaintOrder: false, includeDOMRects: false
    });
  } catch (error) {
    throw new Error('Frame inventory requires Chromium DOMSnapshot.captureSnapshot: ' +
      (error instanceof Error ? error.message : String(error)), { cause: error });
  }
  return summarizeFrameInventory(tree.frameTree, snapshot, visibleDomFrames);
}
