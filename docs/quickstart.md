# Bronto Layout: first 10 minutes

Bronto Layout is a local, free CLI. Node.js 22+ and an installed Chromium-family browser are required for page inspection. No Playwright, Puppeteer, BrontoUI, LLM, server or account is required. Until the first npm alpha is published, install from the repository.

```sh
git clone https://github.com/Ponchia/bronto-layout.git
cd bronto-layout
npm ci
npm link
bronto-layout doctor
```

`doctor` checks that Node and a Chrome/Chromium binary can be found. It does **not** launch the browser or prove that the operating system allows the browser sandbox. For machine-readable preflight, add `--json`.

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

It reports the observed **16px/28px** gaps versus the declared 16px CSS column gap as a *review-only warning*. Unlike an accepted contract this is not a violation and it does not establish whether the offset was intentional. The experimental analyzer is off by default and never makes the page fail CI.

## Run several routes without a shared browser session

```sh
bronto-layout batch --manifest examples/batch.json --dry-run --json
bronto-layout batch --manifest examples/batch.json --parallel 2 --json --compact
```

`--parallel` is optional and bounded to 1–4 jobs; default is one. Each job starts an isolated browser profile so state cannot leak between checked routes. On a resource-limited machine, keep the default. An interrupted batch produces a runtime error, not a passing report.

For developer checks, `npm run test:unit` is the fast browser-free subset; `npm run check` is the complete regression suite. See [architecture](architecture.md), [independent benchmark](field-benchmark.md), and [release checklist](release-checklist.md) for evidence and limitations.
