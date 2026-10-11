# Architecture and boundaries

## Core

`@ponchia/layout` deliberately separates measurements from claims about intended layout:

1. `src/browser.ts`: capture one browser truth snapshot using DOM APIs. A selector can cross an **open** Shadow DOM boundary with `host >>> child`. Closed shadow roots are not inspectable. The adapter sends up to 250 geometry records per alias, while reporting the full count of visible matches.
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
- Every inspector result is bounded and carries omitted counts. Cross-origin
  frames, closed shadow roots, source maps to original preprocessors, and
  authoritative causal CSS attribution remain out of scope.

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
