# Independent open-source websites: external field study

**Stage:** experimental manual validation, not an estimated precision/recall
score. This cohort is deliberately separate from Bronto Layout's own projects
and does not modify the historical first-party 30- or 42-state datasets.

## Sites and publicly available source

The following websites and their associated source repositories are maintained
outside the Bronto projects. Every selected public page returned HTTP 200 on
2026-10-13, and the five GitHub repositories were confirmed public.

| Page | Public codebase | Why include it? |
| --- | --- | --- |
| [Astro Docs EN](https://docs.astro.build/en/getting-started/) | [withastro/docs](https://github.com/withastro/docs) | Astro Starlight responsive docs and sidebar |
| [Astro Docs ES](https://docs.astro.build/es/getting-started/) | [withastro/docs](https://github.com/withastro/docs) | Localization/text-length variation |
| [Docusaurus Docs](https://docusaurus.io/docs/) | [facebook/docusaurus](https://github.com/facebook/docusaurus) | React documentation and sticky navigation |
| [Vite Guide](https://vite.dev/guide/) | [vitejs/vite](https://github.com/vitejs/vite) | VitePress documentation and code samples |
| [Svelte Docs](https://svelte.dev/docs/svelte/overview) | [sveltejs/svelte.dev](https://github.com/sveltejs/svelte.dev) | Interactive app-like documentation |
| [Excalidraw](https://excalidraw.com/) | [excalidraw/excalidraw](https://github.com/excalidraw/excalidraw) | Canvas-heavy app and coverage boundaries |

The v0.1 manifest at [`benchmarks/oss-sites.v0.1.json`](../benchmarks/oss-sites.v0.1.json)
defines four CSS viewport widths for each page: 320, 375, 768, 1280,
for **24 distinct initial-viewport states**. This is not a claim that the
deployed revision matches current repository main; verify any possible bug
against the correct source revision before contacting its maintainers.

A separate [mobile-state study](oss-mobile-state-study.md) explores
approved opened-menu states on the same public projects. It is not part of
the original 24-case initial-viewport denominator.

## Execution and evidence policy

Use the [manual external OSS GitHub Actions workflow](../.github/workflows/oss-field-capture.yml).
Its only permitted site groups are all, docs-only and excalidraw-only;
every URL comes from the reviewed, checked-in allowlist. There are no
user-provided external URLs, no automatic scheduling, no form submissions,
and no visits to authenticated pages. The disposable runner selects stable
Google Chrome, requires successful browser preflight, and retains its
default sandbox. It does **not** turn off browser isolation.

Capture artifacts include an audit JSON, one screenshot per state,
SHA-256 checksums, an offline gallery, reviewer worksheet and blank
human-label template. Artifacts expire on GitHub after seven days;
do not commit third-party rendered screenshots or raw evidence to this
public repository.

A complete browser capture is **not** a design success label. Screenshots
cover only the initial viewport unless the optional bounded full-page
capture is enabled. A known uninspected frame or canvas does not become
a clean page simply because the top-level DOM was measurable.

## Independent review and validation

1. Verify audit-file and screenshot SHA-256 values against `index.json`.
2. Inspect screenshots and their corresponding rendered URLs or a local
   build of the public source **before looking at automated findings**.
   Independently note intentional clipping, current menu state, content
   geometry, images and paint that the browser DOM may not expose.
3. Compare independent notes against Bronto Layout's measured errors,
   review-only warnings, and declared coverage gaps. Do not promote a
   heuristic into a confirmed defect merely to obtain a nonempty dataset.
4. Reproduce any plausible issue against the real site's public source
   where feasible. Only raise an upstream issue with evidence that survives
   independent inspection; never present a synthetic mutation as a
   production bug.
5. Use the existing `field-benchmark.mjs` label workflow for independently
   attested human labels and meaningful detector metrics. Pending or
   unreviewable states never count as true negatives.

Results should focus on *why* a finding is useful/misleading or a surface
is unverified, and what we should change: detector, CLI presentation,
coverage metadata, selector handling or documentation.

## Observed external run — 13 October 2026

The first sandboxed [browser run 38372326004](https://github.com/Ponchia/bronto-layout/actions/runs/38372326004)
completed **24/24 initial-viewport states**, with **48/48 SHA-256 audit
and screenshot hashes verified**. These establish successful browser captures
and evidence integrity, not independent human correctness labels.

| External project | Original observation | How to interpret it |
| --- | --- | --- |
| Astro Docs EN/ES | 6 review-only `pending-image` states (mobile/tablet) | Avatar images were still loading during capture, not proven broken. |
| Docusaurus | 4 states without findings | No measured issue observed; not complete visual quality. |
| Vite Guide | **10px document extent beyond usable scrollport at 320px**, plus 4 skip-link text clipping warnings | Vite's deployed CSS sets the body minimum to 320px and intentionally clips root overflow. Unwanted user-visible scrolling has **not** been established. |
| Svelte Docs | 4 states without findings | No measured issue in this initial browser state. |
| Excalidraw | 4 states without findings | DOM traversal completion alone did not represent its canvas/whiteboard paint coverage. |

Source inspection of Vite's
[published stylesheet](https://vite.dev/assets/style.DKMfOyQO.css)
confirmed `body{min-width:320px;overflow-x:clip}`, while the 320px
session's scrollbar left a **310px content scrollport**. Keep the numerical
width observation without claiming that Vite should change that design.
The 88px `possible-text-clipping` paths all referred to
`.VPSkipLink.visually-hidden`. The skip link is deliberately clipped by
`clip-path:inset(50%)` and `clip:rect(0 0 0 0)` until focused; its
positioning and padding make its outer rectangle larger than 1×1px.
This was a misleading review lead rather than a genuine clipped label.

The original overflow candidates on Vite also contained long code elements
far below the first viewport. Candidate DOM paths are diagnostic hints, **not
proven root causes**. Vite's clipped-root geometry remains a **measured 10px
width fact**; the audit now describes declared root/body clipping rather than
claiming that it necessarily causes user-visible horizontal scrolling.
A controlled regression keeps the clipping container as a candidate but
excludes an enormous locally scrollable code descendant—even when its
container itself overhangs the scrollport. These improvements change the
evidence explanation and attribution, **not** the numerical measurement or
the strict contract exit code.

The external source inspection motivated two separately tested changes:
canvas paint is explicitly marked uninspected rather than clean, and visually
hidden accessibility controls are filtered from clipped-text leads without
suppressing genuinely truncated visible text. Controlled positive and negative
Chromium fixtures passed, including a narrow root with a locally scrolled
code line and RTL overhang with an opposing offscreen menu.

The [second sandboxed external browser run](https://github.com/Ponchia/bronto-layout/actions/runs/38376329176)
completed **24/24 states** with **48/48 hashes verified** again. On Vite
all four spurious skip-link warnings disappeared, while the originally
measured 10px extent at 320px was **preserved**, now with an explicit CSS
clipping caveat. On Excalidraw all four states had **two CSS-visible canvases**
and were correctly marked `known-uninspected-content` with nonblocking
`canvas-content-uninspected` warnings. The six Astro pending-image states
remained review-only, not automatically upgraded to defects.

The same follow-up found that offscreen mobile sidebars could be ranked ahead
of a small inline-end overflow. A controlled LTR/RTL refinement now ranks
inline-end candidates before unrelated offscreen opposite-side elements,
without suppressing the original numeric finding.

The [third, focused 20-state external run](https://github.com/Ponchia/bronto-layout/actions/runs/38377332571)
completed **20/20 documentation-page captures** and **40/40 evidence hashes**.
At Vite's 320px viewport, the first eight candidates now show the actual
**10px right-side extent**, rather than offscreen left-translated mobile
sidebar elements. The skip-link review noise remains absent and the original
10px measurement remains unchanged. The same 20 states included Astro,
Docusaurus and Svelte documentation; Excalidraw's previously verified canvas
coverage gaps were not part of this focused subset.

None of these browser runs provides independently labeled precision/recall.
The historical screenshots and reports remain immutable evidence rather
than retroactively rewritten accuracy labels.

## Bounded full-page evidence (13 October 2026)

A separate [documentation-only full-page run](https://github.com/Ponchia/bronto-layout/actions/runs/38381065788)
captured **20/20** browser states, with **60/60 verified SHA-256
report/viewport/full-page image hashes**. Its screenshots came from the
unchanged, merged commit of PR #80, and raw rendered images are retained in a
private evidence archive rather than committed to this public repository.

The opt-in screenshot cap of **6,000 CSS pixels** was reached in **8/20**
states: all four Docusaurus widths and all four Vite widths. Docusaurus at
320px had a browser-reported document height of **14,623px**; Vite at 320px
had **9,834px**. These height measurements are not assertions that all
below-fold content had loaded or was user-visible.

The other twelve documents (Astro EN/ES and Svelte, four widths each) fit
within the bounded capture height, but a single screenshot still does not
verify lazy assets, animations, menus or keyboard/navigation states.
The automatic-audit findings remained the same six nonblocking Astro
pending-image observations and one Vite 10px clipped-root width observation.
No new confirmed upstream visual defects were established.

This experiment motivates the distinct
[opened-mobile-navigation study](oss-mobile-state-study.md) rather than
silently increasing image limits, interpreting truncated screenshots as
fully reviewed, or widening the accuracy denominator.

## Limits

- One captured viewport misses below-fold and unobserved interaction states.
- Public deployments, assets and selectors change independently.
- Some websites embed canvases, closed Shadow DOM, cross-origin frames,
  layered paints and animations. DOM bounding boxes cannot certify them.
- Pending images and potential overlaps are review leads, not proof of error.
- Browser-level audit success does not establish pixel-perfect rendering,
  cross-browser agreement, accessibility or human design intent.
- Excalidraw is included to challenge coverage honesty, not to inflate
  a clean-page denominator.

The separate first-party validation milestone remains
[issue #27](https://github.com/Ponchia/bronto-layout/issues/27).
Any external OSS field accuracy number requires its own independent labels.
