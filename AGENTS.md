# Bronto Layout development

- This is an independent MIT-licensed TypeScript layout contract engine and Node CLI, not part of BrontoUI and not a Playwright plugin.
- Keep `src/core.ts`, `src/contract.ts`, `src/compare.ts`, `src/sarif.ts` and `src/sweep.ts` free of Node and DOM dependencies. `src/browser.ts` is the opt-in browser measurement layer.
- Keep `bin/bronto-layout.mjs` a portable Node 22+ CLI. It currently uses Chrome DevTools Protocol and the built-in WebSocket; avoid adding frameworks or browser automation runtimes without measured benefit.
- Run `npm run check` before committing. Browser tests use self-contained fixtures and a documented restricted-sandbox fallback; never silently substitute incomplete markup when auditing a real site.
- Treat explicit layout rules as the source of truth. Do not turn uncertain visual/design inferences into deterministic failures.
- Preserve the documented exit code policy: 0 success or no verified regression, 1 violation or regression, 2 invalid input/runtime error.
- Do not invent source file positions in SARIF or CSS root causes without evidence. Never hide missing selectors as passing checks.
- New commands must provide structured JSON and have at least one integration test. Do not add MCP integration until the CLI is validated against real websites.
