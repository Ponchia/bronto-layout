# Bronto Layout: first 10 minutes

Bronto Layout is a local, free CLI. Node.js 22+ and an installed Chromium-family browser are required for page inspection. No Playwright, Puppeteer, BrontoUI, LLM, server or account is required. Until the first npm alpha is published, install from the repository.

```sh
git clone https://github.com/Ponchia/bronto-layout.git
cd bronto-layout
npm ci
npm link
bronto-layout doctor
```

`doctor` checks that Node and a Chrome/Chromium binary can be found. The **default remains non-invasive**: it runs `--version`, does not launch a page and cannot establish sandbox compatibility. For machine-readable preflight, add `--json`.

For an actual **local browser startup check** before your first audit, opt in:

```sh
bronto-layout doctor --verify-launch --json
```

This launches an isolated temporary Chromium profile, checks an active CDP connection to `about:blank`, then shuts down and cleans up. Success returns `status: "launch-verified"` and `browser.launch.connected: true`; failure returns `needs-attention` (exit 2) with a launch reason. The record states whether a sandbox bypass was **requested**, not whether operating-system isolation was independently established. Without the `--no-sandbox` flag or explicit test environment override, no bypass is requested. Do not use `--no-sandbox` for arbitrary public websites: CI only uses it with trusted local fixtures on disposable runners. This preflight does **not** prove site navigation, authentication, page geometry quality or physical macOS compatibility until run on an actual machine.

## Enable autocomplete for your contract (optional)

For JSON-aware editors, start with the schema-tagged
[`examples/schema-enabled-layout.json`](../examples/schema-enabled-layout.json)
or [`examples/schema-enabled-batch.json`](../examples/schema-enabled-batch.json).
They reference the publicly hosted schema files from this repository. To
avoid editor network requests, change `$schema` to a **relative file path**
to `schemas/layout-contract.schema.json` or `schemas/batch-manifest.schema.json`
in your local project. Bronto Layout never downloads these references or uses
them to run a website; its versioned strict parsers remain the final check.

```sh
bronto-layout validate --spec examples/schema-enabled-layout.json --json
bronto-layout batch --manifest examples/schema-enabled-batch.json --dry-run --json
```

Auto-completion covers accepted rules and options, not whether a selector
actually matches a page. See [the schema files](../schemas/) and README.

## Inspect a page without writing a contract

```sh
bronto-layout audit --url http://localhost:5173 --widths 320,375,768,1280 --json --compact
```

Replace the URL with your local development server. `audit` reports document-level overflow and failed visible images as **measured observations**. Potential clipping, pending images and uninspected frames are **review warnings**, not proof of a design defect. An exit code of `0` means no measured issue was found **in the supported, observed scope**, not that the whole design is correct. Exit `1` means an observed issue; exit `2` indicates invalid input or an unverified/runtime failure.

To refuse even a partial inspection of known embedded frames:

```sh
bronto-layout audit --url http://localhost:5173 --fail-on-coverage-gaps --json
```

That policy returns exit `2` for known uninspected content. Closed shadow roots and canvas internals are always outside the supported scope even when no such surface can be positively identified. Use ordinary screenshots and human inspection for visual intent.

If `coverage.status` is `truncated` because the page exceeds the default
18,000-element DOM traversal, increase the bounded inspection allowance
with `--dom-limit 25000` (supported 1,000–50,000, audit only). The compact
report now also includes the actual traversal limit and visited count. An
increased allowance may be slower, must be explicitly requested and does not
prove visual correctness or accessibility.

To investigate a frame coverage warning, use `audit --frame-inventory --json --compact`. This collects additional Chromium frame-tree and DOMSnapshot evidence without certifying layouts inside the frames. If you need strict completeness, keep `--fail-on-coverage-gaps`; it does not become a pass merely because a frame's document appeared in DOMSnapshot.

For manual review beyond the first viewport, `audit --evidence-dir reports/screens --full-page-evidence` creates an additional size-bounded screenshot. Its report says whether the observed document was fully within the capture rectangle or truncated. The screenshot is evidence only: dynamic/lazy-loaded content and iframe interiors remain unverified. See the [field capture protocol](field-benchmark.md) for caps and artifact integrity.

## Try a complete first-run workflow on bundled pages

Before connecting a real development server, reproduce a subtle defect using the shipped `gallery.html` / `gallery-broken.html` fixtures. The broken page shifts one card by 12 CSS pixels, but retains the same document width and working images; a zero-contract audit does not know the intended spacing:

```sh
bronto-layout audit --url examples/gallery-broken.html --width 375
bronto-layout suggest --url examples/gallery.html \
  --selector gallery=.gallery --selector cards=.card --widths 375,768 \
  --out reports/gallery-draft.json
bronto-layout review-draft --draft reports/gallery-draft.json \
  --url examples/gallery-broken.html
# Deliberately accept ONLY the horizontal gap rule for this documented example:
bronto-layout approve --draft reports/gallery-draft.json \
  --accept uniform-x-cards --out reports/gallery-contract.json
bronto-layout check --spec reports/gallery-contract.json \
  --url examples/gallery-broken.html --json --compact
```

Expected: the automatic audit has no strict measured problems; `review-draft` prints the observed **12px** gap deviation versus **2px** tolerance at both widths and exits 1; the final approved contract also fails on that difference. These exit codes are intentional for this exercise. No rule was silently approved. For your own page, carefully review each proposed relationship and use `approve --accept` only for behaviors you want to enforce.

### Save matching screenshots while comparing revisions

To inspect the two **observed** page states visually, rather than relying only
on measured DOM evidence, opt into matching viewport captures:

```sh
bronto-layout audit --baseline examples/audit-healthy.html \
  --url examples/audit-broken.html --widths 375,768 \
  --evidence-dir reports/compare-evidence --json --compact
```

The comparison writes `audit-baseline-375px.png`, `audit-candidate-375px.png`,
`audit-baseline-768px.png` and `audit-candidate-768px.png` to the selected
local directory. Each `comparisonEvidence` JSON entry records its viewport,
paths, `viewport-only` coverage and independently checkable SHA-256 hashes.
Open `reports/compare-evidence/audit-comparison.html` for a script-free,
side-by-side local contact sheet. The rendered PNG previews are grouped by
viewport width; the gallery contains no source URLs, detector predictions,
automated judgments or network/analytics code. JSON metadata also includes
`comparisonGallery.file`, and the HTML Content Security Policy blocks scripts
and remote connections. The gallery does not rehash files on opening. Before using screenshots
copied from another machine, verify the bytes against the saved comparison
report with the **offline verifier**:

```sh
bronto-layout verify-evidence \
  --comparison reports/audit-comparison.json \
  --evidence-dir reports/compare-evidence --json
```

The `--comparison` file is the JSON produced by `audit --baseline ... --json`
(or written with `--report`). The evidence directory contains the paired PNGs.
No browser/network is opened. A missing image, altered SHA-256, symlink, or
invalid PNG signature gives `status: unsafe` and exit `2`; clean evidence gives
`verified` and exit `0`. Original absolute image paths in the report are only
provenance: files are located by validated canonical names in the selected
directory, allowing a copied review bundle to be verified. The supplied JSON
report itself must be trusted; this step does **not** prove visual correctness,
image semantics, browser authorship, or independent human accuracy labels.
Never use `--report` to overwrite the input `--comparison` file.


The page is re-navigated before measuring each revision at each width, and any
explicit `--actions` setup is replayed before its screenshot. Files are never
automatically overwritten: choose a new directory for subsequent comparisons.

The images **do not provide an automatic pixel-based verdict** or certify
below-the-fold content, color/design intent, iframe internals or unmeasured
responsive states. They may show input values or private page information,
so do not upload/reuse evidence from authenticated sessions without review.
Full-page evidence remains available for **single-page** audits only; combining
`--baseline` with `--full-page-evidence` still returns an explicit error.

### Compare a warning that gets worse without becoming a blocking error

To see how experimental grid spacing can become more irregular between two
revisions while **remaining review-only**, run:

```sh
bronto-layout audit --baseline examples/gallery-broken.html \
  --url examples/gallery-broken-worse.html \
  --grid-gap-review --width 375 --json --compact
```

The existing warning's deviation changes from **12px to 24px** at the same
grid; the report uses `review-worsened` rather than creating a new measured
regression. The reverse order yields `review-improved`. The same semantics
apply to persisting text-clipping leads, but neither one reveals whether the
layout was intentionally designed that way. Only explicitly approved layout
contracts can make a design relationship blocking.

## Audit an interactive page state without writing a layout contract

For interactive menus, expanded panels and form states, run `audit --actions` with a
**declarative** setup file. Every sampled viewport starts with a fresh page navigation;
the validated actions are replayed **after readiness/settle and before geometry, audit
findings, screenshots and optional iframe inventory**. The initial state remains the
default when `--actions` is omitted.

```sh
bronto-layout audit --url examples/audit-stateful-broken.html --widths 375,768 --json --compact
bronto-layout audit --url examples/audit-stateful-broken.html \
  --actions examples/audit-stateful-actions.json --widths 375,768 --json --compact
bronto-layout audit --baseline examples/audit-stateful-healthy.html \
  --url examples/audit-stateful-broken.html \
  --actions examples/audit-stateful-actions.json --width 375 --json --compact
```

The included fixture is intentionally misleading when closed: the first command
finds zero measured errors, while opening the panel reveals horizontal overflow
and a missing image. The baseline/candidate comparison replays the **same setup
independently** on both versions and reports newly observed mechanical problems.
A bounded JSON report includes only `stateSetup.actionCount` and `actionTypes`,
**never selectors or filled input values**; keep the original action file private
if it contains information you should not share. Do not use production credentials
in these test fixtures.

Actions allow only `click`, `fill`, `wait-for`, `scroll-into-view` and bounded
`pause` (maximum 30 steps), without accepting arbitrary JavaScript. An absent
action selector or invalid file returns exit `2`, not a passing result. Use
`--ready-selector`, an explicit `wait-for` or bounded `pause` when the application
requires hydration/network settling. The observed state is only the configured
instant/viewport; late animations, authenticated sessions, iframe internals and
complex drag interactions are not automatically covered. `--css-breakpoints`
replays setup at the discovered threshold widths too.

### Find potential sibling collisions without first writing a contract

The optional automatic overlap review can surface intersecting Flexbox/Grid
children that do not widen the document:

```sh
bronto-layout audit --url examples/audit-overlap-broken.html \
  --sibling-overlap-review --width 375 --json --compact
```

The shipped transform example returns a **review warning** for the two card
rectangles that intersect by 29 CSS px; it does not return a contract violation.
Negative-margin avatar stacks and absolute overlays are deliberately excluded.
The result is a geometric prompt for review, not a determination of wrong
placement, visual occlusion or CSS cause. Optional before/after comparisons
show new/worsened review leads but do not fail for them. Missing evidence
and inspection caps remain unverified rather than positive or clean results.

`--sibling-overlap-review` can also be used with `--actions` to inspect an
expanded component, `--grid-gap-review` for separate horizontal-gap hints,
and `--dom-limit` to enlarge a bounded scan when needed. The default `audit`
remains unchanged; use approved contracts to enforce intentional positioning.

## Make an intentional layout regression check

Observe candidate relationships at multiple widths, then explicitly approve only the ones you want to preserve:

```sh
bronto-layout suggest --url http://localhost:5173 --widths 375,768,1280 --out reports/draft.json
bronto-layout approve --draft reports/draft.json --accept document-horizontal-fit --out bronto-layout.json
bronto-layout check --spec bronto-layout.json --json --compact
```

Do **not** approve a suggested alignment or gap merely because the current page happens to satisfy it. First inspect its proposed selector, sampled widths and intended behavior. `check` works in local CI or as a command for a coding agent. `compare --baseline` distinguishes newly broken contracts from pre-existing violations.

### Preserve a specific browser state

Discovery can also save explicitly declared test conditions:

```sh
bronto-layout suggest --url http://localhost:5173 --locale ar --mobile --color-scheme dark \
  --ready-selector '#page' --actions examples/my-state-actions.json \
  --widths 375,768 --out reports/state-draft.json
```

Example `my-state-actions.json` (declarative browser interactions, **not** JavaScript):

```json
[
  { "type": "click", "selector": "#menu-button" },
  { "type": "wait-for", "selector": "#menu-panel" }
]
```

Once approved, that contract saves the tested locale, media preferences, touch mode, viewport height if supplied, readiness condition and actions. `check` replays them automatically; an explicit CLI flag overrides a saved environment choice. Layout selectors, readiness selectors and action selectors support `host >>> .child` across **open** Shadow DOM. Closed roots and cross-origin frames remain inaccessible.

Before approving an inferred rule—or after a meaningful redesign—recheck it against the new version without changing the draft or making it blocking:

```sh
bronto-layout review-draft --draft reports/draft.json --url http://localhost:5174/ --json
```

`still-satisfied` refers only to the same geometric relationship at the originally sampled widths/state; `changed` reports a newly failing measured relationship; `unverified` means the needed geometry is unavailable or ambiguous. Exit codes are `0`, `1` and `2` respectively (an empty draft also returns `2`). The command does not automatically approve any rule. See [contract discovery](contract-discovery.md).

To get a **nonblocking** hint about irregular CSS Grid spacing before authoring any contract, try:

```sh
bronto-layout audit --url examples/gallery-broken.html --width 375 --grid-gap-review
```

On interactive layouts the opt-in warning also works with `--actions FILE`:

```sh
bronto-layout audit --url examples/gallery-toggle-broken.html \
  --actions examples/gallery-toggle-actions.json --grid-gap-review \
  --width 375 --json --compact
```

The collapsed gallery is initially unmeasurable; opening it produces a
nonblocking warning. The combined behavior is checked with real Chromium.

It reports the observed **16px/28px** gaps versus the declared 16px CSS column gap as a *review-only warning*. Unlike an accepted contract this is not a violation and it does not establish whether the offset was intentional. The experimental analyzer is off by default and never makes the page fail CI.

## Audit multiple routes before writing contracts

`batch` accepts mixed manifest jobs. Explicit `mode: "audit"` jobs need a URL,
not a spec; old jobs without a mode remain `check` and must reference a spec.
The bundled examples show 4 independent audits (including an interacted panel
and a nonblocking CSS-grid review warning) and a mixed contract/audit pair:

```sh
bronto-layout batch --manifest examples/batch-audit.json --dry-run --json
bronto-layout batch --manifest examples/batch-audit.json --parallel 2 --json --compact
bronto-layout batch --manifest examples/batch-mixed.json --json --compact
```

The dry run validates **all** specs and declarative action files before any
Chromium instance is opened. Failed actions or missing contracts abort the
batch with exit `2`. Each real job opens a new isolated browser, so previously
entered input, cookies and state cannot bleed between routes. Measured audit
issues and violated explicit contracts produce exit `1`; review-only leads
remain warnings, and incomplete/truncated/strict iframe coverage produces exit
`2`. The batch result records contract assertion counts **separately** from
mechanical audit issues and warnings. See [architecture](architecture.md) and
[the example manifest](../examples/batch-audit.json).

## Run several routes without a shared browser session

```sh
bronto-layout batch --manifest examples/batch.json --dry-run --json
bronto-layout batch --manifest examples/batch.json --parallel 2 --json --compact
```

`--parallel` is optional and bounded to 1–4 jobs; default is one. Each job starts an isolated browser profile so state cannot leak between checked routes. On a resource-limited machine, keep the default. An interrupted batch produces a runtime error, not a passing report.

For developer checks, `npm run test:unit` is the fast browser-free subset; `npm run check` is the complete regression suite. See [architecture](architecture.md), [independent benchmark](field-benchmark.md), and [release checklist](release-checklist.md) for evidence and limitations.
