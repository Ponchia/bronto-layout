# Contributing to Bronto Layout

Bronto Layout is an experimental, MIT-licensed, CLI-first tool. Contributions that make layout contracts **more correct and useful** are more valuable than adding features without measured evidence.

## Development

Use Node.js 22+ and an installed Chrome/Chromium browser.

```sh
npm ci
npm run check
node bin/bronto-layout.mjs check --spec examples/layout.json
node bin/bronto-layout.mjs check --spec examples/layout.json --url examples/broken.html
```

The second check is intentionally expected to exit 1. Browser integration tests use `BRONTO_TEST_INLINE_FIXTURE=1` only to handle tightly restricted test environments, and only with self-contained fixtures; real websites never fall back to inline HTML. Set `BRONTO_REQUIRE_CHROME=1` to prohibit skipping Chromium integration tests. On a locked-down Linux test runner, use `BRONTO_CHROME_NO_SANDBOX=1` only for trusted, isolated fixtures; this disables Chromium sandbox protections.

## Boundaries

- Keep `src/core.ts`, `contract.ts`, `compare.ts`, `sweep.ts`, and `sarif.ts` independent of Node, browser automation, and the DOM.
- Browser-specific measurement belongs in `src/browser.ts`. CDP and CLI process management belong in `bin/`.
- Prefer explicit, stable contracts over speculative visual heuristics.
- A failed browser navigation is an error, not a passing audit.
- Do not add dependencies on a UI framework, Playwright, Puppeteer, or paid service to the library's core.
- Every new rule needs pure geometry and real-browser tests, including a failing fixture.
- Make reports useful for humans and agents without inventing source locations or root causes.

See [Architecture](docs/architecture.md) and [Validation](docs/validation.md).

## Fast development loop

Use `npm run test:unit` for pure TypeScript/Node tests without launching a browser. The full `npm run check` and package test are still required before proposing a merge. Use `npm run profile:cli -- --runs 2` for **trusted local fixture** cold-process timings; do not interpret them as real-world diagnostic quality or browser-reuse measurements. See [release checklist](docs/release-checklist.md).
