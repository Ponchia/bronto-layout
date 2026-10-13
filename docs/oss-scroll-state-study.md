# Below-the-fold verification on independent OSS documentation sites

A single screenshot capped at 6,000 CSS pixels misses portions of long
documents. In the [bounded full-page study](oss-field-study.md), Docusaurus
and Vite exceeded that cap at all four tested widths. Increasing the
screenshot limit would produce larger artifacts without establishing that
lazy-loaded or interactive content is correct.

This separate, manual-only study instead **scrolls to a named, deeply
located section**, records the browser's actual document scroll position
and proves that the section is visible inside the viewport after the
declarative action. It tests two public, independently maintained sources:

| Site and source | Exact page | Declared deep target |
| --- | --- | --- |
| [Docusaurus](https://github.com/facebook/docusaurus) | [Documentation](https://docusaurus.io/docs/) | `#something-missing` |
| [Vite](https://github.com/vitejs/vite) | [Guide](https://vite.dev/guide/) | `#command-line-interface` |

The [fixed cohort](../benchmarks/oss-scroll-states.v0.1.json) checks each
page at 320 and 1280 CSS pixels, for four intended scrolled states.
Its small GitHub Actions workflow is [manually dispatched](../.github/workflows/oss-scroll-state-smoke.yml);
it does not take arbitrary URLs or selectors as workflow inputs.

## Why record `scrollY`?

Bronto Layout already allowed a declarative `scroll-into-view` action, but
the resulting reports exposed only the viewport dimensions, not the
**actual window scroll offset**. With a tall document, a screenshot of
some content or a passing selector-count check alone cannot prove that
the intended below-the-fold state was measured.

The browser snapshot now includes optional `viewport.scrollX` and
`viewport.scrollY` in **CSS pixels**, measured *after* state actions,
and the compact automatic-audit representation exposes the same metadata
as top-level `scrollX`/`scrollY` per viewport. These are literal
`window.scrollX/window.scrollY` observations, not inferred positions from
document height, URL fragments or images.

Both the reviewed `check` contract and independently replayed automatic
audit must report a scroll offset exceeding 1,000 CSS pixels and the
exact approved page URL. The target heading must pass a vertical
viewport-containment rule. An automatic audit can still exit `1` on
unrelated measured geometry, such as Vite's known 10px root-width
difference; only invalid/unsupported audit exit `2` stops the study.

These checks do **not** establish that all content below the fold loaded,
that the site is visually correct at every scroll location, that a fixed
header does not cover some other text, or that every interaction works.
They also do not inspect paint inside canvases, closed Shadow DOM or
uninspected iframe interiors.

## Reproducing the controls

The repository includes a self-contained
[`scroll-deep.html`](../examples/scroll-deep.html) fixture with a heading
more than 5,100 CSS pixels down the document.

```sh
npm ci
npm run build
node bin/bronto-layout.mjs check --spec examples/scroll-deep.json --json
node bin/bronto-layout.mjs check --spec examples/scroll-deep-top-control.json --json
node bin/bronto-layout.mjs audit --url examples/scroll-deep.html \
  --width 375 --actions examples/scroll-deep-actions.json --json --compact
```

The first command should **pass** after scrolling; the second should
**fail** the same vertical-containment rule without any state action.
The final compact audit should expose an actual `scrollY` above 4,500
pixels. Those bundled fixtures can be checked locally without browsing
third-party sites; any browser sandbox override used in tests is limited
to this inert local HTML.

For the external run, an ephemeral GitHub Actions runner launches
**sandboxed stable Chrome**, uses exact fixed public URLs, scrolls
only the approved target into view, and records the contract, audit
JSON and screenshot of that state. It does not click outbound links,
submit forms, log in, mutate website data, or inject JavaScript.
Files have an artifact-root-relative `SHA256SUMS` manifest for verification
after download. Artifacts expire after seven days and are not
automatically published in the repository.

Review any failed external target against that site's public source and
deployment revisions. A selector drift, redirect or incomplete browser
state is an **unverified study case**, not automatically a website bug.
No independent human detector accuracy labels are generated from
these four experiments.
