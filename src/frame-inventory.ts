/** Normalize only factual frame/document inventory from Chromium CDP.
 * This is evidence about coverage, NOT an audit of layout inside the frames.
 * Pure TypeScript: raw Chromium payloads never appear in public reports.
 */
export interface FrameInventoryEntry {
  frameId: string;
  parentFrameId: string;
  url: string;
  snapshotDocument: boolean;
  domNodes?: number;
  layoutObjects?: number;
}
export interface FrameInventory {
  source: 'cdp-frame-tree-and-dom-snapshot';
  status: 'no-child-frames' | 'frame-documents-observed' | 'partial-frame-evidence' | 'bounded-frame-evidence';
  frameCount: number;
  /** Visible top-document iframe/frame elements (not recursive). */
  domVisibleFrames: number;
  /** Visible DOM frames not found in this page target's CDP frame tree. */
  unresolvedDomFrames: number;
  reportedFrames: number;
  omittedFrames: number;
  snapshotDocuments: number;
  snapshotDocumentsOmitted: number;
  observedFrameDocuments: number;
  missingFrameDocuments: number;
  unlinkedSnapshotDocuments: number;
  frames: FrameInventoryEntry[];
  limitations: string[];
}
interface FrameTree {
  frame: { id: string; parentId?: string; url?: string };
  childFrames?: FrameTree[];
}
interface SnapshotDocument {
  frameId?: number;
  nodes?: { nodeType?: number[] };
  layout?: { nodeIndex?: number[] };
}
interface SnapshotResponse {
  strings?: string[];
  documents?: SnapshotDocument[];
}
const FRAME_LIMIT = 48;
const DOCUMENT_LIMIT = 80;
function sanitizeURL(input?: string): string {
  if (!input) return '[unknown URL]';
  if (/^(about:blank|about:srcdoc)$/.test(input)) return input;
  try {
    const value = new URL(input);
    if (value.protocol === 'http:' || value.protocol === 'https:') {
      return (value.origin + value.pathname).slice(0, 240);
    }
  } catch { /* Non-URL from CDP. */ }
  return '[non-http frame URL]';
}
const limitations = [
  'This is a frame-tree and DOM/layout snapshot inventory, not a verification of layout defects inside frames',
  'Frame trees and snapshots may omit out-of-process, cross-origin, inaccessible or not-yet-navigated frames',
  'Canvas/WebGL, CSS causes, closed shadow roots, rendered text intent and accessibility are not certified',
  'Frame and document counts are bounded; embedded URLs omit query strings, fragments and credentials',
  'Only the sampled viewport/navigation state is represented'
];
/** Distinguish frames reported by Page.getFrameTree from frame documents captured by DOMSnapshot. */
export function summarizeFrameInventory(tree: FrameTree, snapshot: SnapshotResponse | undefined, visibleDomFrames = 0): FrameInventory {
  if (!Number.isInteger(visibleDomFrames) || visibleDomFrames < 0)
    throw new Error('Invalid visible DOM frame count');
  if (!tree?.frame || typeof tree.frame.id !== 'string' || !tree.frame.id) {
    throw new Error('Invalid Chromium Page.getFrameTree response');
  }
  const all: FrameTree['frame'][] = [];
  const pending: FrameTree[] = [...(tree.childFrames ?? [])];
  // Page.getFrameTree normally supplies an acyclic tree. Bound work regardless.
  while (pending.length && all.length < 2048) {
    const next = pending.shift()!;
    if (!next.frame || typeof next.frame.id !== 'string' || !next.frame.id) {
      throw new Error('Invalid child frame from Chromium');
    }
    all.push(next.frame);
    if (next.childFrames) pending.push(...next.childFrames.slice(0, 2048));
  }
  const omittedFrames = Math.max(0, all.length - FRAME_LIMIT) + pending.length;
  if (all.length === 0) return {
    source: 'cdp-frame-tree-and-dom-snapshot',
    status: visibleDomFrames ? 'partial-frame-evidence' : 'no-child-frames',
    frameCount: 0, domVisibleFrames: visibleDomFrames, unresolvedDomFrames: visibleDomFrames,
    reportedFrames: 0, omittedFrames: 0,
    snapshotDocuments: 0, snapshotDocumentsOmitted: 0,
    observedFrameDocuments: 0, missingFrameDocuments: 0,
    unlinkedSnapshotDocuments: 0, frames: [], limitations
  };
  if (!snapshot || !Array.isArray(snapshot.documents) || !Array.isArray(snapshot.strings)) {
    throw new Error('Chromium DOMSnapshot did not return a document/string inventory');
  }
  const documents = snapshot.documents;
  const byFrame = new Map<string, SnapshotDocument>();
  for (const doc of documents.slice(0, DOCUMENT_LIMIT)) {
    if (Number.isInteger(doc.frameId) && doc.frameId! >= 0 &&
        doc.frameId! < snapshot.strings.length) {
      const id = snapshot.strings[doc.frameId!];
      if (id && !byFrame.has(id)) byFrame.set(id, doc);
    }
  }
  const frames = all.slice(0, FRAME_LIMIT).map(frame => {
    const doc = byFrame.get(frame.id);
    return {
      frameId: frame.id.slice(0, 128), parentFrameId: (frame.parentId ?? tree.frame.id).slice(0, 128),
      url: sanitizeURL(frame.url), snapshotDocument: Boolean(doc),
      ...(doc ? { domNodes: doc.nodes?.nodeType?.length ?? 0,
        layoutObjects: doc.layout?.nodeIndex?.length ?? 0 } : {})
    };
  });
  const observedFrameDocuments = frames.filter(frame => frame.snapshotDocument).length;
  const unresolvedDomFrames = Math.max(0, visibleDomFrames - all.length);
  const missingFrameDocuments = all.length - observedFrameDocuments;
  const ids = new Set([tree.frame.id, ...all.map(frame => frame.id)]);
  const unlinkedSnapshotDocuments = [...byFrame.keys()].filter(id => !ids.has(id)).length;
  const snapshotDocumentsOmitted = Math.max(0, documents.length - DOCUMENT_LIMIT);
  return {
    source: 'cdp-frame-tree-and-dom-snapshot',
    status: omittedFrames || snapshotDocumentsOmitted ? 'bounded-frame-evidence'
      : missingFrameDocuments || unlinkedSnapshotDocuments || unresolvedDomFrames ? 'partial-frame-evidence'
      : 'frame-documents-observed',
    frameCount: all.length + pending.length, domVisibleFrames: visibleDomFrames,
    unresolvedDomFrames, reportedFrames: frames.length, omittedFrames,
    snapshotDocuments: documents.length, snapshotDocumentsOmitted,
    observedFrameDocuments, missingFrameDocuments, unlinkedSnapshotDocuments,
    frames, limitations
  };
}
