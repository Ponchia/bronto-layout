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

To investigate a frame coverage warning, use `audit --frame-inventory --json --compact`. This collects additional Chromium frame-tree and DOMSnapshot evidence without certifying layouts inside the frames. If you need strict completeness, keep `--fail-on-coverage-gaps`; it does not become a pass merely because a frame's document appeared in DOMSnapshot.

For manual review beyond the first viewport, `audit --evidence-dir reports/screens --full-page-evidence` creates an additional size-bounded screenshot. Its report says whether the observed document was fully within the capture rectangle or truncated. The screenshot is evidence only: dynamic/lazy-loaded content and iframe interiors remain unverified. See the [field capture protocol](field-benchmark.md) for caps and artifact integrity.

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

## Run several routes without a shared browser session

```sh
bronto-layout batch --manifest examples/batch.json --dry-run --json
bronto-layout batch --manifest examples/batch.json --parallel 2 --json --compact
```

`--parallel` is optional and bounded to 1–4 jobs; default is one. Each job starts an isolated browser profile so state cannot leak between checked routes. On a resource-limited machine, keep the default. An interrupted batch produces a runtime error, not a passing report.

For developer checks, `npm run test:unit` is the fast browser-free subset; `npm run check` is the complete regression suite. See [architecture](architecture.md), [independent benchmark](field-benchmark.md), and [release checklist](release-checklist.md) for evidence and limitations.
