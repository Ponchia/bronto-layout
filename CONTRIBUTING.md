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
- [`schemas/layout-actions.schema.json`](schemas/layout-actions.schema.json) —
  standalone `--actions` arrays; keep this schema's five action variants and
  selector bounds identical to the contract schema action definitions.

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

## CI test partitions

CI can run the same full suite across two isolated runner shards for each
supported Node version. This reduces local browser-process contention
without dropping any `tests/*.test.mjs` files. Inspect the exact partition
with `node scripts/ci-test-shards.mjs --plan`. To reproduce one part locally,
after `npm run build`, use `npm run test:shard -- --shard 1/2` or
`npm run test:shard -- --shard 2/2`. These **do not** replace the complete
`npm run check` gate before merging a contribution.

The Node 24 first shard also handles portable coverage thresholds and
versioned controlled benchmarks; the first shard on Node 22/24 verifies the
packed npm consumer. A passing half is **not** a passing suite; all shards
must succeed. Keep new browser tests in the full tests directory and avoid
splitting a test file across concurrent processes.

## Fast development loop

Use `npm run test:unit` for pure TypeScript/Node tests without launching a browser. The full `npm run check` and package test are still required before proposing a merge. Use `npm run profile:cli -- --runs 2` for **trusted local fixture** cold-process timings; do not interpret them as real-world diagnostic quality or browser-reuse measurements. See [release checklist](docs/release-checklist.md).


For developers trying the tool for the first time, the optional
[independent first-use trial](docs/first-use-trial.md) collects workflow
feedback without requiring private website URLs or screenshots. It is
separate from human-labeled field accuracy work.

## Reporting a real-world layout problem

Use the [layout bug issue form](.github/ISSUE_TEMPLATE/bug.yml) with a **minimal, shareable reproduction** and the intended relationship. A measured browser fact, a review-only candidate and an approved semantic contract failure are distinct; say which one you observed. Include viewport width, relevant UI state, Chrome/Node versions and the smallest JSON evidence that makes the result verifiable.

Do **not** attach private authenticated screenshots, private page text or tokens. Follow [SECURITY.md](SECURITY.md) for sensitive issues and avoid disabling Chromium sandboxing when visiting unknown websites.

## Public alpha contributions

Prioritize demonstrable false negatives/positives, stable selector behavior and first-run usability over new speculative heuristics. Controlled fixtures should include intentional negative controls. Never promote tool-generated predictions into independent human benchmark labels. A new detector should be evaluated on human-reviewed, separately sourced evidence before advertising real-world accuracy.

For a compact example of the desired contribution quality, see [the portfolio regression case study](docs/portfolio-regression-case-study.md) and its dedicated Chromium test.
