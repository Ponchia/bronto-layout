# Validation notes

## 2026-10-12: Optional first-party review-only layout diagnostics

The manually dispatched `live-site-smoke.yml` workflow can opt into new
`grid_gap_review` and `sibling_overlap_review` boolean inputs. **Both default
to false.** Selecting either input automatically runs the existing
zero-contract audit step at 320/375/768/1280px on the *fixed public first-party
URLs only* (personal portfolio, Sense6 English, Arabic and Learn). No
user-supplied websites, browser actions or arbitrary scripts are accepted.

Example diagnostic invocation from a correctly authorized GitHub CLI:

```sh
gh workflow run live-site-smoke.yml -R Ponchia/bronto-layout --ref main \
  -f grid_gap_review=true -f sibling_overlap_review=true
```

Results preserve bounded report JSON and diagnostic logs as a seven-day
Actions artifact. Logs contain counts and measured CSS-pixel differences but
no invented judgments or automatically generated human labels. The new
heuristics report **review-only** leads and do not themselves fail the audit;
ordinary measured failures, navigation errors and incomplete DOM inspections
retain their original exit/status behavior. The runner is an isolated
short-lived GitHub Actions environment, which is the only documented context
for the workflow's sandbox override. Never copy that override for browsing
arbitrary external sites from a shared devbox.

Any warnings are *candidates for independent inspection*, not evidence of
poor design. Real-site precision/recall and the human labels in issue #27
remain outstanding; collecting site-specific observations is not a substitute.



## 2026-10-12: local browser startup preflight (opt-in)

Use `bronto-layout doctor --verify-launch --json` to ask Chromium to start an isolated temporary `about:blank` tab with an active CDP connection. This is a stronger *local startup* check than executable-version detection, but it does not prove site navigation, authenticated states, OS sandbox isolation or real-world layout correctness. In particular, on a real Mac/Linux workstation do **not** pass `--no-sandbox`; inspect `browser.launch.sandboxBypassRequested` and confirm it is false. The release checklist still requires third-party physical macOS testing. Test fixtures on disposable hosted CI runners may explicitly opt out of browser sandboxing only for their own bundled local pages.


## 2026-10-12: Opt-in stable-host stress profiling

`npm run profile:stress -- --plan` verifies the 16-job local HTML manifest without Chromium. `npm run profile:stress -- --runs 2 --parallel 2` runs serial and 2-way parallel cold CLI batches followed by 500/5,000/20,000-element synthetic DOM audits. All cases use **bundled trusted fixtures only**, and the profiler never disables Chromium sandboxing. On hosts where user namespaces are unavailable, an explicit sandbox override belongs only in disposable, isolated test runners for these trusted fixtures (not for arbitrary public websites).

Expected semantics: the batch contains deliberate successful and failing contracts, so a CLI batch may return exit 1 without a runtime error. The 20k DOM intentionally exceeds the bounded automatic-audit traversal of 18,000 elements and must return **exit 2 / incomplete coverage**. A separate optional CLI `audit --dom-limit 25000` test now verifies the same 20,000-element page can be traversed without reporting an incomplete top-level DOM, while preserving the smaller default safety cap. This is a targeted correctness result, not a stable throughput benchmark. The script treats these expected statuses separately from process startup/errors. It outputs per-run wall times, counts and coverage evidence. This is *not* a field accuracy test or a promise about performance on a large production app. Use at least three repeats on an otherwise idle reference machine and record CPU, RAM, Chrome version, Node version and system load before comparing code revisions. No performance thresholds are enforced in regular CI.

Exploratory *single-run* local Linux arm64 / Node 24.17.0 sample on 12 October 2026 (shared, loaded host; not a reference benchmark): 16-job serial batch **45.03 seconds**, two-way parallel batch **30.64 seconds**, each reporting 8 passing and 8 deliberately failing layouts with zero runtime errors. Synthetic audits: 500 elements **2.73 s** (504 visited), 5,000 elements **2.79 s** (5,004 visited), 20,000 elements **3.28 s** (traversal capped at 18,000; correctly returned incomplete). This does **not** establish typical latency or any robust parallel speedup. Stable, repeated measurements and peak-memory instrumentation are still pending.



## 2026-10-12: Hardening branch, measured locally (pending PR CI)

- On Linux arm64, Node 24.17.0 and detected Chromium 149, `npm run check` completed **206/206 passing tests** before the final documentation/coverage-test follow-up. The browser fixtures use the explicitly documented restricted-sandbox test mode, not arbitrary internet browsing.
- `npm run test:package` verified an isolated offline installation of the generated v0.4.0 CLI tarball.
- `npm run benchmark:audit:locations` evaluated **33/33 controlled labeled cases**, including element attribution, with exact expected matches. These controlled fixtures are not evidence of field precision/recall.
- The first-party capture artifact (30/30 cases) was downloaded and all screenshot/report SHA-256 hashes independently rechecked. No human labels exist yet; issue #27 stays open.
- macOS portability workflow and PR CI must still complete before marking cross-platform release preparation validated. No npm release has been published.


The October 11 records below are historical snapshots, **not the current test count or current release status**. Consult the latest CI run and `npm run check` before describing current validation. The public alpha still needs independent production labels and macOS browser evidence.

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

## 2026-10-11: CSS container-query inspection

- Chromium inspected a controlled fixture containing a named
  `gallery` container, one condition at 400px and a nested conditional
  rule at 500px. At viewport widths 375/768, the queried child measured
  80/180px wide and 40/90px high. The expanded fixture also contains
  a nested open Shadow DOM with its own @container stylesheet, which is
  collected without user instrumentation. Four browser integration tests passed.
- Read-only inspection of Sense6 English's deployed homepage reported three
  CSS `@container` rules: `dotfit (inline-size < 18rem)`,
  `bronto (inline-size <= 34rem)`, and
  `bronto (inline-size <= 30rem)`. Their conditions were observable
  in the external stylesheet, without any inaccessible stylesheet
  in that test. No visible named/size-query container was found in the
  *homepage state* at 375px; this does not imply that interactive experiment
  states never instantiate one.
- Numeric rem/em thresholds retain their CSS units; the tool does not
  misrepresent them as viewport pixel breakpoints or claim a condition
  applies to one selected element without container association.


## 2026-10-12: Zero-contract before/after comparison

The pure `comparePageAudits` function and CLI
`audit --baseline URL --url URL` are tested against controlled
healthy/broken pages. Chromium integration checks verify 2 new measured
regressions (horizontal overflow and an identifiable broken image),
a review-only clipping change, the inverse fix direction, and unchanged
existing defects. A separate CSS media-query comparison exercises the
701–799px failure interval that coarse endpoint samples miss.

No-rules auto comparisons do not assert that the actual layout change was
undesirable; they report observed browser evidence. Truncated traversal,
missing/duplicate element paths and new unhandled detector categories are
explicitly unverified, and therefore cannot produce a clean exit.
