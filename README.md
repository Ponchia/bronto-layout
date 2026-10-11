# Bronto Layout — CLI-first layout contracts

**A tiny, MIT-licensed foundation for semantic layout contracts.** This is a tested **v0.4 release candidate**, not yet a production-ready tool. It is not yet published to npm.

The thesis: a layout should be testable by the *relationships between elements*, rather than only by image-diff screenshots. A coding agent and a developer should receive the same precise, deterministic diagnosis. It must work on an ordinary site without using BrontoUI, React, Playwright, or Puppeteer.

## What works today

- Pure TypeScript constraint engine: align edges, center, containment, non-overlap, equal gaps, same-size, size-range, horizontal page overflow, and intrinsic image aspect ratio (with `object-fit` awareness).
- Logical `inline-start` / `inline-end` edges that respect document RTL direction.
- Browser-native DOM geometry extraction (`getBoundingClientRect`, `getClientRects`), with named CSS selectors and open Shadow DOM chains (`host >>> child`). No dependency on a framework.
- Minimal Node 22+ CLI that launches installed Chromium/Chrome (including existing browser caches) using the native Chrome DevTools Protocol, **without Playwright or Puppeteer**.
- Versioned contracts, width-specific rules, multi-viewport checks, JSON and SARIF reports, optional annotated PNG evidence, comparison of baseline and candidate pages, and nonzero exit status for CI.
- Tests for pure geometry, browser states, RTL, responsive breakpoints, open Shadow DOM, and deliberate layout violations.
- Bounded, observed element geometry and computed CSS evidence on failed rules; overflow diagnostics include possible overhanging elements, not asserted root causes.

TypeScript is the only development dependency. The CLI has no runtime third-party dependencies and the included `dist/` lets the examples run without compilation.

## Install from source

The package is ready to pack and install locally, but **it has not been
published to npm**. There is no paid service, account requirement, hosted
runtime or production npm release yet.

~~~sh
git clone https://github.com/Ponchia/bronto-layout.git
cd bronto-layout
npm ci
npm run test:package  # builds + packs + verifies an isolated installation
npm link
bronto-layout --help
~~~

Chrome/Chromium startup is handled through native DevTools Protocol
endpoints. When a browser exposes its debugging port before it has opened
a debuggable page, the CLI first checks the existing tab list and then may
create a single blank page using the loopback-only DevTools HTTP endpoint.
A separate bounded page-target timeout tolerates slower CI startup; it does
**not** disable Chromium sandboxing or navigate to a different website.

The installed CLI uses a local Chrome/Chromium executable (Node.js 22+);
it does not ship a browser binary. The planned npm package name is
`@ponchia/layout`, with the executable named
`bronto-layout`. The normal browser sandbox stays enabled.

A clean-room npm install of a generated tarball is tested in CI on Node 22
and 24, including the installed CLI's browser checks against bundled
trusted fixtures. **Preparing a publishable package does not imply that
it has been published to the npm registry.**

## Review-first contract suggestions (experimental)

Generate a provisional contract draft from browser-observed relationships,
then accept only the rules you actually intend to preserve:

```sh
node bin/bronto-layout.mjs suggest --url examples/healthy.html --widths 375,768,1280 --out reports/proposals.json
node bin/bronto-layout.mjs approve --draft reports/proposals.json --accept document-horizontal-fit --out reports/accepted.json
node bin/bronto-layout.mjs check --spec reports/accepted.json --url examples/healthy.html
```

This does **not** infer artistic/design intent automatically. It reports
sampling coverage and requires explicit rule approval. See
[contract discovery](docs/contract-discovery.md).

## Independent field benchmark workflow

A separate capture/label/score workflow prepares a 30-state first-party
production-site cohort. It stores hashed raw Chromium audit reports and
viewport screenshots in ignored `reports/` directories. It never invents
human ground truth or counts unreviewed states as clean pages:

```sh
npm run field:validate
node scripts/field-benchmark.mjs capture --manifest benchmarks/field-sites.v0.1.json --ids portfolio-375 --out reports/field-first-pass
```

Independent review and verified labels are still required before any accuracy
claim. See the [field benchmark protocol](docs/field-benchmark.md).

## Quick start

Requirements: Node.js 22+, Chrome or Chromium. In a source checkout, build once using `npm install` (which compiles the TypeScript automatically), or use a packaged copy with `dist/` included:

```sh
node bin/bronto-layout.mjs --spec examples/layout.json
node bin/bronto-layout.mjs --spec examples/layout.json --url examples/broken.html
```

The first command should exit 0. The second should report violations and exit 1.

To write machine-readable output for an AI agent or CI:

```sh
node bin/bronto-layout.mjs --spec examples/layout.json --json
node bin/bronto-layout.mjs --spec examples/layout.json --report layout-report.json
```

To target a website with that site's own valid selectors, place rules in a new spec, then run:

```sh
node bin/bronto-layout.mjs --spec my-layout.json --url http://localhost:5173/ --widths 320,375,768,1280
```

In restricted Linux test environments, Chromium may refuse to start because user namespaces are disabled. Use `--no-sandbox` only for trusted, isolated testing; it disables an important browser security boundary. **The CLI never adds `--no-sandbox` automatically**, including when running as root; browser tests opt into it explicitly. Never browse untrusted websites without browser sandboxing.

The spec's `.url` is resolved relative to the spec itself; a CLI `--url` file path is resolved relative to the current directory. Chrome detection supports Chromium and Chrome on Linux/macOS; `--chrome /path/to/chrome` overrides it.

The manually dispatched `Live-site CLI smoke` workflow also offers an
opt-in `automatic_audit` mode. It runs this command against the
personal website and Sense6 English/Arabic/Learn at four widths, preserving
JSON and logs as downloadable CI artifacts. It is not part of normal PR
tests, and external sites can change independently.

The `npm run benchmark:audit` command runs a hand-labeled regression
suite of known issues, intentional negative controls and media-query
boundary cases. It reports false positives and false negatives
**for those controlled fixtures only**, not for production sites.
See the [benchmark methodology](docs/audit-benchmark.md).

## Zero-configuration layout audit (experimental)

Run `audit` against an ordinary web page **without writing a
layout contract**. By default it visits 320, 375, 768 and 1280 CSS-pixel
viewport widths:

~~~sh
bronto-layout audit --url https://example.com --json --compact
bronto-layout audit --url http://localhost:5173 --widths 320,375,768 --json
bronto-layout audit --url examples/audit-broken.html --width 375
~~~

The first, deliberately conservative checks distinguish:

- **Measured observations (exit 1):** document-wide horizontal overflow
  beyond the usable viewport, or visible image elements whose load completed
  without intrinsic image data.
- **Review warnings (exit remains 0):** potentially clipped leaf text or
  images still loading during sampling. Explicit CSS ellipsis and common
  visually hidden/screen-reader-only geometry are suppressed.
- **Incomplete traversal (exit 2):** more DOM elements were present than
  the bounded inspector could examine. Embedded frames are reported as
  review-only unknowns; their internal layout is not inspected.

For details, inspect `reports[].findings`. Every issue has a
`classification` of `measured` or `review`,
a code and browser-grounded element evidence. A measured fact does **not**
establish whether the design decision was intentional. No AI model or
server is involved.

A CSS-aware sweep also works without a contract:

~~~sh
bronto-layout audit --url examples/breakpoint.html --scan 600:900:300 --css-breakpoints --json --compact
~~~

The fixture passes at the two coarse widths but demonstrates horizontal
overflow around its CSS media-query boundaries. Reports record all sampled
widths. This is *not* exhaustive proof of correct layout between samples.

Unlike named-selector `check` and `inspect` commands, automatic `audit` does not yet accept `--stable-for`: without explicitly selected child elements, a geometrically quiet body box cannot certify that its contents stopped moving.

The audit uses a bounded DOM traversal and does not inspect internal
canvas/WebGL geometry, closed Shadow DOM, nested iframe contents or
cross-browser rendering. It is not an automated WCAG compliance verdict.
WCAG 2.2's 320-CSS-pixel reflow requirement has exceptions for content that
needs two-dimensional layout; see
https://www.w3.org/WAI/WCAG22/Understanding/reflow.html.
For durable intentionality and exact relationships, use the existing
`check --spec` layout contracts instead.

## Inspect CSS container queries (opt-in)

Modern components can switch layout based on the size of an ancestor CSS
query container, not necessarily a window `@media` rule.
The browser-native CLI can now inspect the **declared** container rules
and actual measured named/sized container elements:

~~~sh
bronto-layout inspect --url examples/container-query.html --widths 375,768   --selector child=#child --container-queries --json
~~~

The `containerQueries` output gives the observed stylesheet
accessibility, `@container` condition text and names, bounded candidate
pixel thresholds, and computed container name/type/size at each sampled
viewport. The fixture's child changes width when its parent container
grows beyond a 400px condition. Browser-resolved source URLs omit query
strings and credentials.

This **does not automatically evaluate whether a particular `@container`
rule matches a selected element**, or convert a 400px *container* threshold
into a 400px *viewport* breakpoint. Rules nested under `@media` or
`@supports` are inspected, but their applicability is not inferred
from rule presence. CSSOM-access-inaccessible stylesheets and bounded
traversal limits are explicitly reported; a zero detected rule count
cannot prove a page uses no container queries if stylesheets are inaccessible.

The adapter also inspects accessible style sheets in **open Shadow DOM**
and adopted stylesheets used by Web Components. Closed roots and inaccessible
cross-origin stylesheets are outside its evidence coverage.

It supports older `CSSContainerRule.containerQuery` and the
newer multi-condition `CSSContainerRule.conditions` where available.
Absolute CSS `px` conditions include a numeric pixel candidate;
relative `rem` and `em` conditions preserve their declared
units instead of inventing a viewport pixel equivalent. Per the
[CSS Conditional Rules specification](https://www.w3.org/TR/css-contain-3/),
relative units in container queries are resolved using the queried
container's relevant computed values, not a generic viewport mapping.
No application source changes, npm runtime dependencies or MCP are required.

See [MDN CSSContainerRule](https://developer.mozilla.org/en-US/docs/Web/API/CSSContainerRule)
and [Chrome's DevTools container-query inspector](https://developer.chrome.com/docs/devtools/css/container-queries/).

## Compare automatic audit findings before and after an edit

The zero-contract audit can compare a *baseline* page with the edited page
without first writing alignment or spacing rules:

~~~sh
bronto-layout audit --baseline http://localhost:5173/ --url http://localhost:5174/ --json --compact
bronto-layout audit --baseline examples/audit-healthy.html --url examples/audit-broken.html --widths 320,375,768 --json --compact
bronto-layout audit --baseline examples/breakpoint-healthy.html --url examples/breakpoint.html --scan 600:900:300 --css-breakpoints --json
~~~

Both versions are inspected by the same Chromium session at **identical**
viewport widths. When CSS-breakpoint sampling is enabled, the CLI gathers
boundary widths from both versions to avoid missing a new responsive branch.

- **Exit 1:** a newly observed or meaningfully worse measured problem,
  including document-level horizontal overflow or a newly broken image.
- **Exit 0:** no new measured regression, even if previously observed problems
  remain. Review-only changes such as possible text clipping are shown but
  do not fail the command.
- **Exit 2:** an inspection cannot establish a reliable comparison
  because of incomplete DOM traversal, omitted or ambiguous element
  attribution, unsupported new detectors, or an ordinary runtime error.

Compact reports keep the measured changes, their element paths and widths,
**remaining candidate issues** and totals; unchanged passing observations
are omitted. The full JSON report includes both underlying audits.

This comparison describes **observable evidence**, not visual design intent.
A large intentional layout can have horizontal overflow, and changing the
DOM's identity/structure can change non-ID element paths without a visual
defect. Use `--ready-selector` for application routes that might otherwise
load an error page, and use explicit `check` layout contracts for approved
alignment/spacing requirements. Do not read an exit-0 comparison as proof of
a universally healthy website.

## Browser CSS preference states

The CLI can verify appearance-dependent layout rules without requiring source
changes or Playwright. Pass `--color-scheme dark` for dark-mode CSS and
`--reduced-motion` for reduced-motion CSS. The browser captures the
*observed* preference flags in each viewport snapshot, so an agent can verify
that the emulated state actually applied.

~~~sh
node bin/bronto-layout.mjs check --spec examples/media-preferences.json --color-scheme dark --reduced-motion
node bin/bronto-layout.mjs inspect --url examples/media-preferences.html --selector card=#card --color-scheme dark --json
~~~

These flags are **opt-in**. They affect CSS media-query evaluation within the
local Chromium inspection browser; they do not simulate all possible display
profiles or operating-system accessibility settings.

## Layout contract example

`examples/layout.json` defines *observed relationships*, not CSS recipes:

```json
{
  "widths": [320, 375, 768, 1280],
  "selectors": {
    "heading": ".heading",
    "gallery": ".gallery",
    "first": ".card:nth-child(1)",
    "second": ".card:nth-child(2)",
    "third": ".card:nth-child(3)"
  },
  "rules": [
    { "id": "no-overflow", "type": "document-overflow", "tolerance": 1 },
    { "id": "align-gallery", "type": "align-edge", "a": "heading", "b": "gallery", "edgeA": "right", "tolerance": 2 },
    { "id": "equal-card-gaps", "type": "equal-gaps", "elements": ["first", "second", "third"], "axis": "x", "minWidth": 768 }
  ]
}
```

The result returns `pass`, `fail`, or `skip` for every rule; missing elements are failures rather than silently skipped tests. Each geometry failure includes the measured deviation, tolerance, and identified browser elements.

## Agent-friendly CLI output

Use compact structured reports when a coding agent needs failures and responsive
sample widths rather than hundreds of passing rectangles:

~~~sh
node bin/bronto-layout.mjs check --spec examples/layout.json --url examples/broken.html --json --compact
node bin/bronto-layout.mjs compare --spec examples/layout.json --baseline examples/healthy.html --url examples/broken.html --json --compact
~~~

Compact check reports include all failure and unmeasurable counts, up to 100
individual findings in each category, omitted counts when capped, factual
element geometry, sampled widths and CSS breakpoint metadata. Compact compares
also preserve *existing candidate failures* separately from newly verified
regressions. These are **observations at sampled widths only** and do not prove
continuous correctness between samples.

Fatal errors under `--json` now produce a JSON error envelope on stdout with
`mode: "error"`, `exitCode: 2`, and the diagnostic message. An explicit
`--report FILE` is also written on failure, even if its parent directory does
not exist. Routine human-readable errors still use stderr.

## Batch layout checks across routes and languages

The CLI can run a finite suite of **independent layout contracts** using a
versioned batch manifest. The manifest lists each job's unique id, spec file,
and optional URL, locale, viewport widths, responsive scan, or CSS preferences.

~~~sh
# Check the plan without launching Chromium
node bin/bronto-layout.mjs batch --manifest examples/live-sites-batch.json --dry-run --json

# Check the actual first-party sites and receive an agent-friendly aggregate
node bin/bronto-layout.mjs batch --manifest examples/live-sites-batch.json --json --compact
~~~

Job paths are relative to the manifest; each job runs sequentially in a separate
local Chromium inspection process. There is **no shell execution from manifests**,
and a manifest is limited to 16 jobs. The batch preserves all results, even if
an individual page fails to load. The aggregate exit status is 0 for all passing,
1 for one or more layout violations, and 2 if any job has an inspection/runtime
error. Use `--dry-run` before running a large first-party site suite.

See `examples/batch.json` for controlled passing and broken fixtures,
and `examples/live-sites-batch.json` for our personal site and Sense6
English/Arabic/Learn contracts. Optional settings can also be provided per job
rather than changing the underlying app or writing custom shell scripts.

## Browser-observed CSS source hints

For a selected element, Bronto Layout can optionally retrieve the matching
**author CSS declarations** and their stylesheet locations using Chromium's
native CSS domain. This is useful after a failing spatial contract: identify
which style rules are associated with the element before editing CSS.

~~~sh
node bin/bronto-layout.mjs inspect --url examples/css-sources-fixture.html --width 375 --selector example=#example --css-sources --json
node bin/bronto-layout.mjs inspect --url examples/css-sources-fixture.html --selector "inside=#host >>> .inner" --css-sources --json
~~~

The same flag also works with `check` and `scan`:
it gathers CSS rule leads **only on failing viewport widths**, using named
elements actually associated with the violated constraints:

~~~sh
node bin/bronto-layout.mjs check --spec examples/css-sources-check.json --css-sources --json --compact
~~~

The report returns `cssSourceLeads` grouped by sampled width, with
`ruleIdsByAlias` mapping each inspected element alias back to violated
layout rules. Missing selectors or document-level overflow often cannot be
attributed to a named inspected element, so those rule IDs appear under
`unattributedRuleIds` rather than receiving invented causes.

At most eight failing widths are inspected for CSS, with
`omittedCSSSourceWidths` retaining the number not examined.
This is opt-in and does not change the rule results or CI exit codes.
When all constraints pass, no additional stylesheet inspection is performed.
`compare` remains deliberately unsupported by this flag.

The optional `cssSources` response contains selected aliases, matched
element counts, sampled elements, matched author selectors, relevant layout
declarations and browser-observed stylesheet URLs. **Only external CSS URLs
with verified declaration ranges receive source line numbers.** Inline
`<style>` declarations may carry the enclosing page URL but no
misleading HTML line number. CSS `style` attributes are distinguished.

The tool **does not** infer which matched declaration actually won the cascade,
which authored Sass/LESS file generated an output stylesheet, or whether a
declaration caused a layout defect. These are evidence leads for a developer or
coding agent. In open Shadow DOM use `>>>` selector boundaries;
closed roots and cross-origin frame contents are unsupported.

This is deliberately opt-in and bounded: up to 24 aliases, 6 elements per alias,
48 inspected elements in total and 16 layout-relevant rules per element, with
omission counts. No extra runtime dependencies, paid services or MCP server.

The manually dispatched `Live-site CLI smoke` workflow has an optional
`layout_shifts` input to collect lab scores from the personal site
and Sense6 English, Arabic and Learn across 375/768/1280px viewports. Reports
are kept as CI artifacts; this diagnostic run uses no failure threshold
for unexpectedly moving content.

## Layout stability contracts (Chromium lab)

Bronto Layout can measure spontaneous layout movement during loading,
hydration, delayed rendering and font/image settlement. It uses Chromium's
native Layout Instability API before page navigation; no Playwright or app
instrumentation is required.

~~~sh
# Inspect a page's observed layout shifts and affected element boxes
node bin/bronto-layout.mjs inspect --url examples/layout-shifts-unstable.html --width 375 --layout-shifts --settle 850 --json

# Declare a maximum observed session-window score as a layout contract
node bin/bronto-layout.mjs check --spec examples/layout-shifts.json --url examples/layout-shifts-unstable.html --settle 850 --json --compact

# Compare a stable version with a shifted one; score changes use "score" units
node bin/bronto-layout.mjs compare --spec examples/layout-shifts.json --baseline examples/layout-shifts-healthy.html --url examples/layout-shifts-unstable.html --settle 850 --json
~~~

A `layout-stability` rule requires an explicit nonnegative
`maxScore` budget. The CLI automatically enables observation whenever
this rule appears; `--layout-shifts` enables observation without a
rule for `inspect`, `check`, `scan` and
`compare`. Batch manifests can request it per job using
`layoutShifts: true`.

The score is the **largest observed five-second session window**, separated
by at least a one-second gap, excluding shifts marked with recent user input.
The report includes bounded affected-element geometry. Use `--settle`
to capture delayed loading/hydration; an observation stops when each selected
viewport is measured. Unsupported/truncated observation is reported as
**unmeasurable**, never a pass. Use `--fail-on-skip` in CI if needed.

These are **lab observations** made under the selected viewport, browser,
locale and scripted state. They are not real-user Core Web Vitals or
proof of layout stability after the observation window. Browser support is
currently Chromium only; dynamic canvas/WebGL internals are not measured.

The optional `geometry_stability` input of the manually dispatched
`Live-site CLI smoke` GitHub workflow exercises DOM quiet-window
measurement on the personal website and Sense6 English/Arabic across several
viewport widths. It preserves JSON evidence without making external websites
part of routine PR tests.

## Wait for a stable layout before verifying a page

Client-rendered websites can change element geometry after initial DOM readiness.
Use the optional `--stable-for MS` flag to sample the declared selectors
until their positions, dimensions, wrapping fragments, scroll sizes and the
document's dimensions remain within **0.5 CSS pixels** of the start of a
continuous quiet window. Unlike a fixed `--settle` delay, the quiet
window resets when a meaningful geometry change is observed.

~~~sh
# This fixture expands a card after loading; the CLI waits before checking.
node bin/bronto-layout.mjs check --spec examples/geometry-stable.json --stable-for 850 --timeout 5000 --json --compact

# Inspect a page after its measured geometry settles.
node bin/bronto-layout.mjs inspect --url examples/geometry-delayed.html --selector card=#card --width 375 --stable-for 850 --json

# Deliberately animated geometry cannot claim to have settled.
node bin/bronto-layout.mjs inspect --url examples/geometry-moving.html --selector card=#card --stable-for 700 --timeout 2500 --json
~~~

The interval must be **100–5000 ms** and shorter than `--timeout`.
The option works with `check`, `scan`, `inspect`,
`compare` and `batch`; batch manifests can set
`stableFor` per job. Responses include `stabilization`
evidence with the sample count, elapsed time and observed geometry changes.

If the page never settles within the time budget, the CLI returns exit code
**2** (inspection could not complete) rather than falsely reporting that its
layout contracts passed. If a selector matches more elements than the bounded
DOM sampler can fully measure, stabilization also refuses to claim success.

This is a **sampled geometric quiet window**, not a proof that the page will
stay unchanged indefinitely. It cannot detect purely decorative color changes,
visual changes inside a canvas/WebGL surface, or movement entirely between
sampling instants. Use `--layout-shifts` for observed browser layout
instability and screenshots for visual judgments. No Playwright, additional
runtime dependency or application instrumentation is required.

## Architecture

- `src/core.ts` — pure, portable TypeScript with no DOM, Node or rendering dependency. Any browser, test runner or game UI adapter can supply its rectangles.
- `src/browser.ts` — standalone DOM measurement adapter; callable inside a normal browser tab.
- `bin/bronto-layout.mjs` — optional Node runner using a local installed Chrome/Chromium via CDP. No browser automation framework dependency.
- `examples/` — controlled layouts for verifying correctness and false-positive behavior.
- `tests/` — pure geometry tests and an end-to-end browser test.

No usage analytics, account, hosted service, external API or paid features.

## Important limitations

1. The CLI currently operates against Chrome/Chromium. The TypeScript core does not depend on it, but **cross-browser verification is future work**.
2. The DOM adapter handles ordinary elements. Closed shadow roots, cross-origin frames, and contents rendered within canvas/WebGL require additional interfaces or host-provided geometry.
3. A browser extension, permanent visual inspector, MCP tools, WebKit/Firefox automation and full layout-intent inference **are not implemented**. The CLI does offer conservative automatic observations and opt-in matched CSS source hints; neither establishes source-level causality.
4. It checks *explicit user intent*. It does not claim that all reported overlaps are bugs, that it understands art direction, or that its heuristics outperform competitors.
5. Images rendered with `object-fit: cover/contain/scale-down` preserve content proportions inside a potentially differently shaped image box; the prototype skips naive outer-box aspect ratio diagnostics for those cases.
6. Local HTML fixtures use a loopback-only asset server. It only serves common web asset extensions under the fixture directory, and rejects hidden files and symlink escapes. This is not a JavaScript sandbox: only run trusted fixtures with normal Chromium sandboxing enabled. A restricted test fallback can inject self-contained markup *only when* `BRONTO_TEST_INLINE_FIXTURE=1` is set; it is never silently used for production audits. Use an existing development server for full application projects.
7. This is a v0.x alpha; it has not yet been published to npm. First-party live-site CLI smoke and batch audits have passed; broader cross-browser validation is still needed.

## Real-site CLI validation

Use the tracked first-party layout contracts as controlled smoke checks:

```sh
node bin/bronto-layout.mjs check --spec examples/personal-site.json
node bin/bronto-layout.mjs check --spec examples/sense6-gallery.json
node bin/bronto-layout.mjs check --spec examples/sense6-ar.json --locale ar
node bin/bronto-layout.mjs check --spec examples/sense6-learn.json
```

The same workflow offers an opt-in `css_sources` input to inspect
real matched author CSS on the deployed portfolio and Sense6 using isolated
GitHub Actions Chromium. The JSON reports are retained as downloadable CI
artifacts. This does not weaken the CLI's default browser sandbox, and
this external-site check never blocks an ordinary PR.

On GitHub, the manually triggered **Live-site CLI smoke** workflow can
optionally execute the complete first-party batch manifest using its
`batch` input; the older individual-route checks remain available.
Aggregate batch reports and logs are retained as workflow artifacts.

On GitHub, the manually triggered **Live-site CLI smoke** workflow checks these
contracts and preserves JSON reports and logs as artifacts. Its optional
css_breakpoints workflow-dispatch input additionally runs media-query-aware
scans on the personal site and Sense6 English/Arabic, so the new width sampler is
tested on real pages without making external websites a normal CI dependency.
Unlike unit tests, these may fail when a remote site is unavailable or changes
independently of this repository. They do **not** run on every contribution.

The viewport snapshot preserves `width` for responsive breakpoints and also reports
`contentWidth`, the space available after reserved scrollbars. Alignment and
containment against the viewport use that usable width.

Use `axis: "x"` with `contained` to check horizontal fit of content that extends
below the viewport. Without `axis`, containment checks both directions.

## What would justify a standalone Bronto Layout project?

We should validate more than the ability to measure rectangles. The differentiators should be:

- **Durable layout intent:** semantically meaningful, versioned contracts that remain useful across viewport sizes and content changes.
- **Actionable diagnostics:** exact deviations, source-level clues where safe, visible overlays and before/after verification without unexplained AI guesses.
- **Adaptive responsive coverage:** identify problematic width intervals and breakpoint boundaries rather than checking only two fixed screenshots.
- **Accessible to agents *and* humans:** stable JSON, CLI/CI, in-browser overlay, later an optional MCP layer.
- **Trustworthy results:** low false-positive rate, explicit intentionality/suppression rules, bounded sampling, reproducible evidence.

A good first validation would use the existing tests of Sense6, plus the relatively simple personal site, followed by the intentionally intricate image layouts in Chiara's portfolio. Spatial would need a dedicated geometry adapter for its infinite canvas and should retain its own native canvas-lint ownership.

**Prior art:** Galen (declarative responsive contracts), Snug (agent-oriented layout diagnostics), Responsively (open-source synchronized responsive browser + MCP), Polypane (extensive commercial browser debugging). Bronto Layout should not duplicate them just to put another name on the same functionality.

## License

MIT. Copyright notice and full terms in `LICENSE`.

## Additional CLI commands (v0.4)

```sh
node bin/bronto-layout.mjs --help
node bin/bronto-layout.mjs inspect --url examples/shadow.html --selector "card=#card-a >>> .inner" --json
node bin/bronto-layout.mjs scan --spec examples/responsive.json --scan 320:920:80 --refine
node bin/bronto-layout.mjs compare --spec examples/layout.json --baseline examples/healthy.html --url examples/broken.html --json
node bin/bronto-layout.mjs validate --spec examples/layout.json
```

`same-size` compares image or control dimensions; `size-range` checks an element's width or height against optional minimum and maximum values. Use `--fail-on-skip` to fail when a measurement is unavailable, without treating an intentionally out-of-range rule as an error. Large selectors return exact visible-match counts but bound detailed geometry to 250 elements.

[Controlled audit benchmarks v0.1 and v0.2](docs/audit-benchmark.md) · [Controlled element-localization benchmark](docs/audit-benchmark.md) · [Research and prioritized roadmap](docs/research-and-roadmap-2026-10-11.md) · [Architecture and limits](docs/architecture.md) · [Validation notes](docs/validation.md) · [Contributing](CONTRIBUTING.md)


### Repeated-grid layout contracts

Use uniform-gaps to compare spacing across many CSS-matched items (including wrapped rows), without naming each item. Items are grouped into visual lanes; the rule fails on inconsistent spacing, and skips when evidence is insufficient or truncated. Set laneTolerance for near-aligned rows. Example: examples/gallery.json.

Chrome sandboxing is never silently disabled by the CLI. Use --no-sandbox only in a controlled, trusted environment, not for arbitrary websites.


### Scan at CSS media-query breakpoints

A coarse viewport scan can miss a defect that exists only inside a narrow responsive range. The optional `--css-breakpoints` flag asks Chromium for CSS media-query thresholds and includes integer viewport widths immediately below, at, and above each discovered threshold:

```sh
node bin/bronto-layout.mjs scan --spec examples/breakpoint-contract.json --scan 600:900:300 --css-breakpoints --json
```

That fixture passes at the two coarse widths (600px and 900px), but fails inside the CSS media-query interval of 701–799px. The JSON output records `cssBreakpointScan.thresholds` and `cssBreakpointScan.addedWidths` so an agent can reproduce the failure precisely.

`compare --css-breakpoints` discovers breakpoints in both the baseline and candidate pages and checks their combined sample widths. This is **sampling**, not a proof of correctness at every intermediate width. It does not discover JavaScript-only breakpoints, container queries, embedded cross-origin frames, or CSS unloaded at both probe widths. It requires `--scan`; narrow the range if there are too many thresholds.
