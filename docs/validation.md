# Validation notes

## 2026-10-11: Initial CLI tests

- `npm run check`: 47 of 47 tests pass on Node.js 22 and locally installed Chromium.
- Tests cover pure geometry, validation, RTL logical edges, responsive scan/refinement, comparison classification, action-state setup, mobile/locale emulation, SARIF, and annotated evidence screenshots.
- The browser integration tests are real Chromium runs against self-contained HTML fixtures. In this tool's restricted test container they use an explicitly guarded fixture fallback (`BRONTO_TEST_INLINE_FIXTURE=1`) when local HTTP navigation is blocked; this fallback is **not** enabled for normal production audits. As a result, some external stylesheets/assets are deliberately not exercised by these fixtures.
- Before-and-after fixture: healthy layout produced 0 failures; broken layout produced 9 regressions across widths 320, 768 and 1280, detected by the contract engine. Counts are specific to the example contract, not generic detection metrics.
- Evidence screenshot reviewed at 768px: geometry rectangles were annotated; labels may overlap in crowded areas.

## 2026-10-11: Deployed website smoke check

The same developer machine that hosts the projects was used to run an independent read-only Chromium/Playwright **measurement harness** against the deployed URLs. This was not the Bronto Layout CLI, which has not yet been installed on that machine.

| Site | Widths | HTTP | Direction | Horizontal overflow | Additional observation |
|---|---|---|---|---|---|
| Personal website `https://brontolotto.observer/` | 320, 375, 768, 1280 | 200 for all | LTR | 0 at all | `.site` center deviation 0px; `.site-header` contained in `.site` |
| Sense6 English `https://sense6.net/en/` | 320, 375, 768, 1280 | 200 for all | LTR | 0 at all | `body` present |
| Sense6 Arabic `https://sense6.net/ar/` | 320, 375, 768, 1280 | 200 for all | RTL | 0 at all | `body` present |

The deployed website tests are a baseline only. They do not establish the absence of narrower-element clipping, inaccessible controls, or other state-dependent layout errors.

## To validate next

1. Run the **actual CLI** using `examples/personal-site.json`, `examples/sense6.json` and `examples/sense6-ar.json` on a normal internet-connected development machine.
2. Compare its reports with manually verified defects and false-positive rates.
3. Test dynamic routes and workflows (experiment start states, menus, overlays), WebKit/Firefox, nested RTL fragments, zoom, printing, and closed Shadow DOM.
4. Benchmark runtime and the consistency of diagnostics on large DOMs, especially Spatial's node-based UI.
5. Evaluate Snug and existing browser inspection tools against the **same fixtures** before making performance or quality claims.

## 2026-10-11: v0.3 CLI-only extensions

- `npm run check`: 47/47 local tests passed, including Chromium tests using the explicitly guarded self-contained fixture fallback.
- Tested open Shadow DOM paths and exact counts for selectors with more than 250 matches.
- Added tests for `same-size`, `size-range`, and viewport-range skips under `--fail-on-skip`.
- These checks do not yet constitute a completed real-site CLI audit or head-to-head benchmark.


## 2026-10-11: Experimental automatic layout auditing

- Controlled healthy and broken HTML fixtures check viewport overflow,
  missing image resources, possible text clipping, intentional horizontal
  scroll containers, CSS ellipsis and visually hidden assistive labels.
- The audit detects the existing `examples/breakpoint.html` media-query
  overflow without needing a layout contract, whereas coarse 600/900px
  sampling alone misses it.
- Read-only live CLI probes: personal portfolio at 375px and Sense6
  English/Arabic at 320, 375 and 768px yielded **zero measured issues**.
- The first Sense6 probe flagged its 1x1 `.sr-only` language label as
  clipped text. We reproduced the exact browser geometry, taught the
  diagnostic to recognize the assistive-only pattern by computed CSS/size
  rather than site-specific naming, and reran both language variants. After
  the change both had zero review warnings.
- These are **mechanical observations over covered top-level DOM only**, not
  comprehensive visual quality or WCAG conformance assessments. Test more
  real designs and capture reviewed true/false labels before claiming
  competitive accuracy or a low false-positive rate.
