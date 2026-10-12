# Architecture and boundaries

## Core

`@ponchia/layout` deliberately separates measurements from claims about intended layout:

1. `src/browser.ts`: capture one browser truth snapshot using DOM APIs. `src/composed-selector.ts` supplies the same deep selector resolution for geometry, readiness and declared actions. A selector can cross an **open** Shadow DOM boundary with `host >>> child`. Closed shadow roots are not inspectable. The adapter sends up to 250 geometry records per alias, while reporting the full count of visible matches.
2. `src/core.ts`: evaluate declared constraints against geometries, returning explicit pass/fail/skip results. Only caller-approved constraints become definitive failures.
3. `src/contract.ts`: validate versioned JSON contracts and fail closed on unsupported fields or references.
4. `src/sweep.ts`: sample viewport widths, with optional refinement when statuses differ between sampled widths. It cannot prove absence of narrow failures between unchanged endpoints.
5. `src/compare.ts`: classify regressions, improvements, unchanged defects and unverified checks between same-browser runs.
6. `src/sarif.ts`: emit SARIF records at real page URLs with DOM paths in properties; never pretend DOM coordinates are source file lines.

The pure modules have no Node.js or DOM imports. Applications can generate a `LayoutSnapshot` without Chromium.

## Matched CSS source diagnostics

- `src/css-sources.ts` is a portable pure normalizer for observed CDP
  matched author CSS styles, capped to layout-related declarations and rules.
- `src/css-inspector.ts` provides a CDP adapter using
  `DOM.getDocument`, `DOM.querySelectorAll` and
  `CSS.getMatchedStylesForNode`, including explicit traversal of open
  shadow roots. The CLI only invokes it when `inspect --css-sources` is requested.
- Matched declarations are **not** cascade winners or verified causes.
  Only external stylesheet URLs receive declaration positions. Chrome can
  return an HTML document URL for a `<style>` sheet; the adapter must
  check its `isInline` flag and never publish misleading file-line positions.
- `src/css-failure-leads.ts` selects only the DOM element aliases
  actually associated with failed contract findings. The CLI can attach those
  matched author CSS rules directly to failed `check`/`scan`
  widths using `--css-sources`. Unattributed failures stay explicit:
  neither a document overflow nor a missing selector is assigned a guessed
  source. At most eight failing widths are instrumented; omission counts
  remain visible even in compact JSON reports.
- Every inspector result is bounded and carries omitted counts. Cross-origin
  frames, closed shadow roots, source maps to original preprocessors, and
  authoritative causal CSS attribution remain out of scope.

## Layout instability observation

`src/layout-shifts.ts` provides two isolated capabilities: a
self-contained early-page `PerformanceObserver` collector injected
through CDP `Page.addScriptToEvaluateOnNewDocument`, and a pure
TypeScript reducer calculating the maximum CLS-style session-window score.
Only entries without `hadRecentInput` contribute to the score.
Events and element geometry are bounded; incomplete observations are marked
unmeasurable instead of being treated as zero.

The `layout-stability` contract validates the score against an
explicit maximum. Ordinary browser geometry remains separate in
`captureDOMGeometry`. This metric observes *one navigation
and its configured settle/actions window*; it cannot establish later
conditions or population-wide Core Web Vitals.

## Geometric stabilization prior to checks

The pure `src/geometry-stability.ts` compares observed DOM geometry by
composed element path, instead of relying on DOM enumeration order. It tracks
element identity and visible counts, bounding boxes, client/scroll dimensions,
wrapping fragments and document/viewport extent; CSS style differences that do
not change measured geometry are intentionally outside this signal.

The opt-in CLI `--stable-for` flag repeatedly invokes the same
`captureDOMGeometry` adapter after navigation, browser readiness,
declared actions and any fixed `--settle` delay. Each sample is
compared against the **start of the current quiet window** (rather than only
the previous sample) to detect cumulative subpixel drift. A geometry change
resets the quiet window; success records the sample count, observation time and
maximum measured deviation in the snapshot/report.

Incomplete element samples or a timeout produce an explicit CLI runtime
error, never a passing layout contract. This does not certify the state of a
page outside its finite sampled interval, nor does it infer design intent.
There is no browser-automation framework dependency.

## Local HTML fixture server

The CLI delegates local HTML asset loading to
`bin/local-fixture-server.mjs`. It binds to 127.0.0.1 only, resolves
real filesystem paths before streaming, rejects hidden files, path traversal,
unsupported extensions and symlinks escaping the fixture directory. No
directory listing is exposed. Common HTML, CSS, JavaScript, image, font and
media asset types continue to load normally.

The fixture server is a boundary against accidental local-file exposure,
**not** an isolation environment for arbitrary untrusted HTML/JavaScript.
Use Chromium's default sandbox for untrusted websites and prefer a real
development server for full applications. The isolated self-contained markup
fallback requires an explicit test-only environment variable; it never
silently stands in for unavailable production assets.

`tests/local-fixture-server.test.mjs` directly verifies normal
assets, hidden files, denied extensions, traversal, symlinks, file URL input
and HTTP URL passthrough. The package validator requires the server module
to be present in the installable npm tarball.

## Opt-in frame document inventory

`src/frame-inventory.ts` is a pure, bounded normalizer for `Page.getFrameTree` and `DOMSnapshot.captureSnapshot`; `src/frame-inspector.ts` is the Chromium adapter. Its purpose is to account for frame documents visible in the browser frame tree but absent from the returned DOM snapshot. It does not claim to inspect cross-origin layout or determine root causes, and a captured layout-object count is not a quality assertion. Inventory is only collected when `audit --frame-inventory` is requested, and ordinary no-frame pages avoid a full DOMSnapshot call. `--fail-on-coverage-gaps` is unchanged: known embedded content remains unverified until dedicated inner-frame analyzers exist. Captured URLs are sanitized and report elements are bounded.

The field benchmark scorer independently excludes content-coverage gaps from whole-page precision and recall even if capture bytes are complete and independently human-reviewed. This also applies to legacy captures where `coverage.status` did not yet exist but embedded frame counts were positive.

## Zero-contract mechanical audit

`src/audit-browser.ts` is a self-contained DOM capture adapter
that traverses visible DOM elements and explicitly open Shadow DOM. It
collects bounded, factual evidence for images that failed to decode/load
and potentially clipped leaf text. It deliberately excludes text explicitly
truncated with `text-overflow: ellipsis` and 1x1 clipped,
absolutely/fixed-positioned assistive labels. Source URLs omit query strings,
fragments and embedded data.

`src/audit.ts` is pure TypeScript. It combines those observations
with the existing DOM geometry snapshot to identify top-level horizontal
overflow and classify results into measured observations and review-only
warnings. It does not infer CSS root causes or report all overlaps as bugs.
The audit summarizes viewport coverage and reports bounded omissions rather
than hiding them. It deliberately does not recurse into frame documents or
claim to understand canvas/WebGL internals.

`bin/bronto-layout.mjs audit` uses the existing Chromium/CDP
runtime, responsive CSS-breakpoint scanner, JSON report handling and normal
exit-code semantics. No additional runtime libraries, proprietary services,
or MCP implementation are required.

## Browser-observed CSS container-query inventory

The portable, self-contained browser adapter
`src/container-queries.ts` walks accessible CSSOM rules including
nested grouping and imported stylesheets (including accessible open
Shadow DOM and adopted stylesheets), reads `CSSContainerRule`
single- or multi-condition APIs, and records computed named/sized query
container boxes. It tracks unreadable CSSOM stylesheets and strict
traversal/output bounds rather than silently claiming complete coverage.

Literal `px` thresholds are **candidate values of container dimensions**.
Relative `rem`/`em` thresholds retain their units and cannot
be converted into viewport pixels without the correct query container.
They are not window viewport breakpoints, active-style statements,
layout contract violations or automatic patch recommendations.
Cross-origin stylesheets can deny CSSOM access. The CLI currently exposes
the adapter through opt-in `inspect --container-queries`, not strict
`check` contracts or automatic `--css-breakpoints` sampling.

## Chromium page-target recovery

The Node CLI launches a sandboxed local Chrome/Chromium browser with its own
temporary profile. The browser process can expose a usable debugging port
before the DevTools page list has a target, especially under CI load.

The dependency-free `bin/chromium-target.mjs` helper first checks the local
`/json/list` endpoint. After a short grace period it can issue one
`PUT /json/new?about:blank` to create a page, then use that page for CDP.
The page target has a separate bounded deadline from launching the debugging
port. URLs are strictly checked against the known loopback port and
`/devtools/page/` target path, never accepting arbitrary remote WebSockets.

Unit tests include an existing-page path, an empty-list recovery path, a
blocked create endpoint, browser exit, invalid ports, and a real loopback HTTP
server. The installed npm tarball check confirms the module ships with the CLI.

This does not retry or hide failed layout assertions. If Chrome still has no
usable target, the CLI returns a descriptive exit 2 error.

## Before/after automatic audit comparisons

`src/audit-compare.ts` is a pure TypeScript evidence comparison engine.
It requires the same unique viewport widths in baseline/candidate reports,
distinguishes new measured problems from improvements and review-only changes,
and refuses to infer a clean state from truncated DOM traversal or ambiguous
element paths.

Document-level overflow is compared quantitatively with a 1px significance
floor. Broken images and possibly clipped text are compared by observed
element paths; added/missing paths are regression/improvement leads only
within their respective measured/review categories. Pending images and
uninspected iframe count differences are **review-only**, not strict errors.
Any new detector code without comparison semantics is **unverified**, not
silently ignored.

`bronto-layout audit --baseline URL --url URL` reuses one native-CDP
browser session and the same geometry/automatic audit adapters for both
versions. Its optional media-query sweep combines CSS breakpoint evidence
from baseline and candidate. It keeps normal CLI exit 0/1/2 behavior.
No generated contracts, LLM calls, MCP, or third-party runtime packages
are involved.

## CLI and browser runner

`bin/bronto-layout.mjs` uses built-in Node.js modules, an installed Chromium-family browser, and the Chrome DevTools Protocol over WebSocket. It does not depend on Playwright or Puppeteer. In restricted Linux CI/devbox environments where user namespaces are disabled, the opt-in `--no-sandbox` flag (or `BRONTO_CHROME_NO_SANDBOX=1`) allows execution, but reduces browser isolation and should only be used in a trusted, isolated environment. For a locally supplied HTML file it serves the file and its relative assets over loopback HTTP. For existing sites it navigates normally.

A command can execute explicit declarative actions to reach an application state before measuring it. Arbitrary JavaScript is deliberately not accepted in contracts. Browser automation for authentication, iframes, and complex dragging is not part of the current CLI.

## Non-goals and limitations

- This is **not** a replacement for Chrome, Firefox, WebKit, Responsively, or Polypane.
- It does not automatically understand whether all overlaps are intentional.
- Canvas/WebGL contents require application-supplied geometry adapters.
- The current CLI launches Chromium only; cross-browser adapters are future work.
- The `image-aspect` rule skips image boxes using `object-fit: contain|cover|scale-down` because the visible content can preserve intrinsic proportions even when the element's outer box doesn't.
- Reports can contain CSS selectors and browser page URLs. Avoid sharing reports from private pages without reviewing them.

## Exit codes

- `check`: 0 when all active checks pass, 1 for violations.
- `compare`: 0 when there are no verified regressions (existing defects may remain), 1 for new/worsened verified regressions.
- `validate`, `inspect`, `init`: 0 on success.
- Any command: 2 for invalid input, navigation failure, or runtime errors.
- `--fail-on-skip` treats **measurement-unavailable** skips as failures, but not explicitly out-of-width-range rules.

The early v0.x schema may evolve; breaking changes will be documented in the changelog.

## CLI runtime decomposition (2026-10-12)

- `bin/chrome-detect.mjs` discovers an installed browser without downloading or launching it (`doctor` also reads its version).
- `bin/cdp-client.mjs` handles bounded DevTools WebSocket requests and events.
- `bin/chromium-session.mjs` owns the child process, isolated temporary profile, page-target recovery and cleanup. Chromium startup can have an isolated one-time retry *only* when `DevToolsActivePort` is absent after the bounded startup window. The old profile and child are cleaned before a new attempt. `--timeout` can extend the per-attempt window; navigation failures, invalid binaries, page-target errors and layout violations never trigger automatic retries. A second startup failure remains exit code 2 with explicit diagnostics.
- `bin/bronto-layout.mjs` retains command orchestration and reports; further command-handler extraction should be measured and regression-tested rather than rewritten speculatively.
- Batch jobs remain isolated subprocesses, with optional 1..4 worker concurrency and serial execution as the default. Browser startup is **not** reused across independent jobs; cookies and localStorage are intentionally kept separate.
- Approved `scenario` and `actions` fields in version-1 contracts reproduce the explicit environment and declarative interactive state captured during suggestion. The CLI can override the environment on demand.
- Audit `coverage.status` indicates whether the *supported top-document/open-shadow scope* was measured, known embedded frames were uninspected, or traversal was truncated. Closed roots and paint-order remain inherently unknown.

## Bounded document screenshot evidence (2026-10-12)

`src/bounded-screenshot.ts` is a pure CDP screenshot-clip planner from Chromium CSS layout metrics. The audit CLI captures the initial viewport normally and, only with `audit --evidence-dir ... --full-page-evidence`, writes a second PNG using `captureBeyondViewport` with a top-left clip capped at 4,096×6,000 CSS pixels / 12M CSS pixels. The report includes the measured document dimensions, captured rectangle, truncation status and source limitations. It does not alter `analyzePageAudit` or layout-contract evaluations.

The field-capture wrapper can opt into that additional image, stores independent SHA-256 provenance, and requires its integrity when human review artifacts or scores reference it. The reviewer must still inspect the rendered page and interactions; static full-height capture is not an accessibility, lazy-load, iframe or interactive correctness guarantee. The fullpage option remains disabled by default on production capture workflows to avoid unnecessary large artifacts and image exposure.

## Blind, offline field review gallery (2026-10-12)

`scripts/field-review-gallery.mjs` renders a local HTML contact sheet from `index.json` metadata and separately verified screenshot paths. It does not read audit findings, create labels, invoke a browser, or upload data. `scripts/field-benchmark.mjs review-gallery` shares the integrity-checking evidence rows with the Markdown worksheet. Missing/tampered data is clearly unsafe and never linked as a valid image; path traversal and symlink escapes are rejected, URLs and HTML metadata are escaped, and only safe page origins/paths are navigable. A restrictive CSP disables scripts and remote resources (images are relative local files).

The allowlisted manual `field-capture.yml` workflow generates both review aids after capture when an index is present, even if some cases failed. The artifact continues to expire after seven days. Human review remains external to the generated HTML and measured audit reports, avoiding contamination of expected labels by the model's own findings.
