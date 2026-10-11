/**
 * Browser-observed Layout Instability entries, collected before navigation.
 * This is a lab observation of the visited page/interaction state, not a field
 * Core Web Vitals measurement or a proof about unseen time intervals.
 */
export interface ShiftRect { x: number; y: number; width: number; height: number }
export interface ShiftSource {
  tag: string;
  locator: string;
  previousRect: ShiftRect;
  currentRect: ShiftRect;
}
export interface ShiftEntry {
  startTime: number;
  value: number;
  hadRecentInput: boolean;
  sources: ShiftSource[];
}
export interface RawShiftObservation {
  supported: boolean;
  reason?: string;
  observedEvents: number;
  droppedEvents: number;
  events: ShiftEntry[];
}
export interface LayoutShiftSummary {
  supported: boolean;
  reason?: string;
  /** Largest session-window sum, excluding shifts with recent user input. */
  maxSessionScore: number;
  /** All non-input shift values in the observation window. */
  totalScore: number;
  shiftCount: number;
  ignoredInputCount: number;
  droppedEvents: number;
  /** Bounded data for diagnostics, never source content or text. */
  events: ShiftEntry[];
}

const rounded = (score: number) => Number(score.toFixed(8));

export function summarizeLayoutShifts(raw: RawShiftObservation | undefined): LayoutShiftSummary {
  if (!raw?.supported || raw.droppedEvents > 0) {
    return {
      supported: false,
      reason: raw?.droppedEvents ? 'Layout-shift event limit reached; result is incomplete'
        : raw?.reason || 'Layout Instability API unavailable',
      maxSessionScore: 0, totalScore: 0, shiftCount: 0, ignoredInputCount: 0,
      droppedEvents: raw?.droppedEvents ?? 0, events: raw?.events ?? []
    };
  }
  const sorted = [...raw.events].sort((a, b) => a.startTime - b.startTime);
  let maxSession = 0;
  let session = 0;
  let sessionStart = -1;
  let lastShift = -1;
  let total = 0;
  let shiftCount = 0;
  let ignoredInputCount = 0;
  for (const entry of sorted) {
    if (!Number.isFinite(entry.value) || entry.value <= 0 || !Number.isFinite(entry.startTime)) continue;
    if (entry.hadRecentInput) { ignoredInputCount++; continue; }
    const time = entry.startTime;
    const reset = sessionStart < 0 || time - lastShift > 1000 || time - sessionStart > 5000;
    if (reset) { sessionStart = time; session = 0; }
    session += entry.value;
    lastShift = time;
    total += entry.value;
    shiftCount++;
    maxSession = Math.max(maxSession, session);
  }
  return {
    supported: true, maxSessionScore: rounded(maxSession), totalScore: rounded(total),
    shiftCount, ignoredInputCount, droppedEvents: 0, events: sorted.slice(0, 256)
  };
}

/**
 * Self-contained function for Page.addScriptToEvaluateOnNewDocument.
 * No imports, closure state, or third-party libraries are referenced here.
 */
export function installLayoutShiftCollector(): void {
  type BrowserShiftRecord = ShiftEntry;
  type BrowserCollector = {
    supported: boolean;
    reason?: string;
    events: BrowserShiftRecord[];
    observedEvents: number;
    droppedEvents: number;
    read(): RawShiftObservation;
  };
  const host = window as unknown as { __brontoLayoutShiftCollector?: BrowserCollector };
  if (host.__brontoLayoutShiftCollector) return;
  const records: BrowserShiftRecord[] = [];
  let observer: PerformanceObserver | undefined;
  let count = 0;
  let dropped = 0;
  const MAX_ENTRIES = 256;
  const bbox = (rect: DOMRectReadOnly | undefined): ShiftRect => ({
    x: rect?.x ?? 0, y: rect?.y ?? 0,
    width: rect?.width ?? 0, height: rect?.height ?? 0
  });
  const ingest = (entries: PerformanceEntry[]) => {
    for (const item of entries) {
      const event = item as PerformanceEntry & {
        value?: number; hadRecentInput?: boolean;
        sources?: Array<{ node?: Node | null; previousRect?: DOMRectReadOnly; currentRect?: DOMRectReadOnly }>;
      };
      if (!Number.isFinite(event.value) || (event.value ?? 0) <= 0) continue;
      count++;
      if (records.length >= MAX_ENTRIES) { dropped++; continue; }
      const sources: ShiftSource[] = [];
      for (const source of (event.sources ?? []).slice(0, 5)) {
        if (!(source.node instanceof Element)) continue;
        const node = source.node;
        const tag = node.tagName.toLowerCase();
        const locator = node.id ? '#' + (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(node.id) : node.id)
          : tag + (node.classList.length ? '.' + (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(node.classList[0]) : node.classList[0]) : '');
        sources.push({
          tag, locator: locator.slice(0, 180),
          previousRect: bbox(source.previousRect),
          currentRect: bbox(source.currentRect)
        });
      }
      records.push({
        startTime: item.startTime, value: event.value ?? 0,
        hadRecentInput: Boolean(event.hadRecentInput), sources
      });
    }
  };
  const collector: BrowserCollector = {
    supported: false, events: records, observedEvents: 0, droppedEvents: 0,
    read() {
      if (observer) ingest(observer.takeRecords());
      return {
        supported: this.supported,
        ...(this.reason ? { reason: this.reason } : {}),
        observedEvents: count,
        droppedEvents: dropped,
        events: [...records]
      };
    }
  };
  host.__brontoLayoutShiftCollector = collector;
  try {
    if (typeof PerformanceObserver === 'undefined' ||
        !PerformanceObserver.supportedEntryTypes?.includes('layout-shift')) {
      throw new Error('Layout Instability API not supported');
    }
    observer = new PerformanceObserver(list => ingest(list.getEntries()));
    observer.observe({ type: 'layout-shift', buffered: true });
    collector.supported = true;
  } catch (error) {
    collector.reason = error instanceof Error ? error.message : String(error);
  }
}
