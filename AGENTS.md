# Bronto Layout development

- This is an independent MIT-licensed TypeScript layout contract engine and Node CLI, not part of BrontoUI and not a Playwright plugin.
- Keep `src/core.ts`, `src/contract.ts`, `src/compare.ts`, `src/sarif.ts` and `src/sweep.ts` free of Node and DOM dependencies. `src/browser.ts` is the opt-in browser measurement layer.
- Keep `bin/bronto-layout.mjs` a portable Node 22+ CLI. It currently uses Chrome DevTools Protocol and the built-in WebSocket; avoid adding frameworks or browser automation runtimes without measured benefit.
- Run `npm run check` before committing. Browser tests use self-contained fixtures and a documented restricted-sandbox fallback; never silently substitute incomplete markup when auditing a real site.
- Treat explicit layout rules as the source of truth. Do not turn uncertain visual/design inferences into deterministic failures.
- Preserve the documented exit code policy: 0 success or no verified regression, 1 violation or regression, 2 invalid input/runtime error.
- Do not invent source file positions in SARIF or CSS root causes without evidence. Never hide missing selectors as passing checks.
- New commands must provide structured JSON and have at least one integration test. Do not add MCP integration until the CLI is validated against real websites.

- When working on the CLI, keep `bin/cdp-client.mjs`, `bin/chrome-detect.mjs` and `bin/chromium-session.mjs` independent and dependency-free.
- `npm run test:unit` is a fast, browser-free developer subset; it does not replace `npm run check`, controlled fixture benchmarks or package installation tests.
- Discovery proposals must carry only observed evidence and explicitly configured state; never auto-approve a rule or synthesize independent human labels.

## Documentation and releases

- Start at `docs/README.md`; active beta gates are in `docs/release-checklist.md`.
- Keep historical evidence in `docs/archive/`, distinct from current instructions.
- Run `repo-instruction-audit --repo .` after instruction or documentation changes.
- Use `docs/npm-publishing.md` for authorized npm operations. First publication,
  registry verification and GitHub announcement are separate outcomes.
- Qualify the beta with reproducible in-house checks. External-developer trials
  are not release gates; do not claim independent adoption or human accuracy.
