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

## Keep public contract and batch schemas in sync

The versioned JSON editor schemas are **source-tree artifacts**, not runtime
validators. A change to the accepted shape of any layout rule, batch job,
scenario or declarative action must update the corresponding static schema:

- [`schemas/layout-contract.schema.json`](schemas/layout-contract.schema.json) —
  the 14 rule types, selector aliases, actions, scenarios and viewport samples.
- [`schemas/batch-manifest.schema.json`](schemas/batch-manifest.schema.json) —
  finite `check`/`audit` job modes and their distinct allowed fields.

Use `npm run test:unit` to run the Ajv Draft 2020-12 parity tests against the
actual TypeScript parsers and all bundled valid examples. Add both accepted and
rejected fixture cases, and test every new rule or field with a real Chromium
integration. Run `npm run test:package` to confirm the schema files and exports
exist in both isolated offline consumer installations. Ajv is **dev-only**;
no DOM inspection, browser or production command should require it.

An optional `$schema` property enables editor autocomplete. It is ignored as
an instruction by the CLI, which never fetches the schema URL. Parser-side
selector alias resolution and cross-field numeric validation remain the final
authority, as JSON Schema does not prove those relationships.

## Fast development loop

Use `npm run test:unit` for pure TypeScript/Node tests without launching a browser. The full `npm run check` and package test are still required before proposing a merge. Use `npm run profile:cli -- --runs 2` for **trusted local fixture** cold-process timings; do not interpret them as real-world diagnostic quality or browser-reuse measurements. See [release checklist](docs/release-checklist.md).
