# Bronto Layout: competitive research and development priorities

Updated 11 October 2026 · CLI-first · MIT · evidence before heuristics

## Position

Bronto Layout should not recreate Polypane's whole browser or rebrand
Snug's automatic checks. It should be a portable, free, open-source layout
evidence and verification engine usable without any framework, account
or hosted service.

Separate three levels of truth:

- **Measured observations:** physical browser evidence such as viewport
  overflow, an image that failed to load, source-mapped CSS, and rectangles.
- **Review leads:** suspicious conditions that can be intentional, including
  clipped labels, internal scrolling, layering and partial frame coverage.
- **Accepted contracts:** explicit design intent such as alignment, spacing,
  containment or stability, suitable for deterministic CI assertions.

Neither a zero-contract audit nor inferred design relationships establish
artistic intent, CSS causality or WCAG conformance.

## Competitive findings, 11 October 2026

| Tool | Verified capability | Implication |
|---|---|---|
| [Snug](https://github.com/creynir/snug) (MIT) | Zero-config checks for overlap, overflow, containment, truncation, spacing, occlusion, stacking and more. Its documented false-positive heuristics recognize edge-mounted items, negative margins, CSS gap, overflow clipping and SVG. README claims 95% recall across 99 mockups; **not independently verified here**. Repository last pushed 30 March 2026, not archived. | Quality and precision matter more than a longer category list; compare on the same labeled pages before claiming better results. |
| [Polypane](https://polypane.app/docs/debug-tools/) | Commercial multi-pane browser with 40+ debug tools, visual overlays and responsive/accessible inspections. | Compete on repeatable contracts and agent-readable evidence, not number of browser panels. |
| [Responsively App](https://github.com/responsively-org/responsively-app) (AGPL) | Open-source multi-viewport responsive browser. Repo last pushed 3 October 2026. | Do not clone an entire browser merely to analyze layout. |
| [Galen](https://galenframework.com/) | Declarative responsive layout constraints, with repo last pushed 15 July 2022. | Spatial contracts are established prior art; emphasize diagnostic quality and portability. |
| [Chrome DOMSnapshot](https://chromedevtools.github.io/devtools-protocol/tot/DOMSnapshot/) | Flattened DOM/layout snapshots, iframe/shadow coverage, style whitelists and optional paint order. | Evaluate a dedicated adapter for cross-frame evidence and stacking. |
| [CSS container query DevTools](https://developer.chrome.com/docs/devtools/css/container-queries/) | Inspect styles that depend on parent container sizes instead of viewport media rules. | Container-driven responsive behavior is a gap in the current CSS media-query sweep. |
| [WebDriver BiDi, W3C WD 8 Oct 2026](https://www.w3.org/TR/webdriver-bidi/) | An actively evolving standard for bidirectional browser automation. | Consider an optional cross-browser runner, validate Firefox/Chrome first, WebKit separately. |
| [WCAG 2.2 Reflow, SC 1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) | 320-CSS-pixel reflow guidance with exceptions for content requiring two-dimensional layout. | Use 320px as a sensible default without claiming the audit proves accessibility compliance. |

## Prioritized milestones

### P0 — Verified CLI preflight and distribution

- Keep automatic audit conservative: measured root overflow and failed visible
  images versus review-only clipping, pending images and iframe coverage.
- Maintain durable semantic contracts and strict 0/1/2 exit semantics;
  report explicitly when a DOM traversal or measurement is incomplete.
- Continue Node 22/24 Chromium CI and testing installed npm tarballs.
  Public npm publication remains a separate release decision.
- Use manual first-party website checks without tying PR CI to mutable
  external websites.

### P1 — Labeled precision/recall benchmark

Build a versioned ground-truth dataset, with at least 30 independent examples
across photo galleries, typography, dashboards, RTL pages, stateful widgets,
canvas shells, and intentionally scrollable components.

Record true positives, false positives, false negatives and *unverifiable*
observations by detector category. Independent human review should confirm
labels, rather than using the tool's own output as truth.

Concrete regression controls include 1x1 screen-reader-only text, explicit
ellipsis, internal scroll areas, overlay badges, image fit/cropping, and
responsive widths where a failure exists only inside a short interval.

Report metrics for **that** dataset only; neither Snug's self-reported
benchmark nor our small fixtures justify broad superiority claims.

### P2 — Container-aware responsive analysis

Initial inventory is now available as opt-in
`inspect --container-queries` with CSSOM declarations and computed
container boxes. **Not implemented yet:** automatically search parent-container
size thresholds across application states or verify actual rule applicability.



Observe container query rules, named containers and actual container sizes
while varying viewport, content and application state. Locate meaningful
thresholds empirically; an estimated boundary is a sampling lead, not a
guarantee of correctness at all intermediate widths.

Consider nested scroll-container diagnostics and deliberate reflow tests.
An experimental, opt-in CSS grid `column-gap` anomaly review lead now exists; it does not cover general flexbox, arbitrary layout sibling spacing or infer intent. Keep it nonblocking until human-labeled positives and negative controls demonstrate its precision/recall.

Occlusion/overlap should initially be review leads with suppression rules,
not strict automatic errors.

### P3 — Broader web surfaces

Prototype DOMSnapshot in a separate adapter for iframe/shadow and paint-order
evidence. Report closed roots, inaccessible frames, canvas/WebGL and unsupported
browser features as explicit coverage gaps.

Preserve host-supplied geometry adapters for Spatial's infinite canvas and
other custom rendered surfaces.

Evaluate an optional Firefox runner using WebDriver BiDi only when its
required behavior passes the same browser fixtures. Investigate WebKit on
its own; do not promise parity without tests.

### P4 — More useful agent repair loops

Expose exact observed deviations, element references, CSS stylesheet
evidence, and optional visual overlays without invented root causes.

Allow users or agents to draft layout contracts from observed spatial
relationships, but never activate inferred rules as blocking checks without
explicit acceptance.

Keep the CLI complete without MCP, a hosted service, or LLM access.
MCP should be a thin optional adapter after CLI ergonomics mature.

## Comparison conditions

Meaningful head-to-head research must use the **same pages, browser versions,
viewport sizes, content states, network/loading conditions and reviewed labels**.
Different tools' issue counts are not directly comparable.

The initial live audit of the personal website and Sense6 English/Arabic
found no measured defects at tested mobile/tablet widths. A first false warning
on Sense6's 1x1 assistive language label was reproduced, eliminated through
computed-style/geometry detection, and verified in both languages.

Those findings support the correctness of a narrow behavior, **not**
production-wide precision, recall, or WCAG conformance.
