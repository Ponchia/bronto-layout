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
