# Bronto Layout with an existing Playwright test

If your project already uses Playwright, you do **not** need a second browser
process, devtools session or separate CLI state runner to evaluate semantic
layout relationships. The optional `@ponchia/layout/playwright` adapter uses
Playwright's standard `Page.evaluate()` interface to capture the *current*
viewport's DOM geometry and then feeds it into Bronto Layout's pure contract
evaluator. It imports **no Playwright runtime dependency** and does not
navigate, click, scroll, set locale, launch Chromium or upload evidence.

The module is experimental until validated across independent consumers. It
is supported in the repo source and its next verified prerelease; the already
published GitHub `v0.5.0-beta.1` tarball **does not** contain this new export.

```ts
import { test, expect } from '@playwright/test';
import { checkPlaywrightPage } from '@ponchia/layout/playwright';
import { readFile } from 'node:fs/promises';

const contract = JSON.parse(await readFile('./tests/layout/home.json', 'utf8'));
test('homepage keeps approved relationships after opening the menu', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('http://127.0.0.1:4173/');
  await page.locator('#menu').click(); // explicitly-owned UI state
  const report = await checkPlaywrightPage(page, contract);
  expect(report.summary.failed).toBe(0);
  expect(report.summary.skipped).toBe(0); // optional strict skip policy
  expect(report.summary.passed).toBeGreaterThan(0);
});
```

The contract may specify `widths` and the adapter checks that the **actual**
browser viewport is among them. If it contains `actions` or a non-empty
`scenario`, the adapter refuses to pretend they were replayed: configure those
through your Playwright fixture/test. A contract's `url` is metadata here;
this adapter does not navigate or verify the address. Use your test's
`page.goto()` and navigation expectations. The adapter does **not** perform
screenshot diffs or native touch/keyboard/focus accessibility tests; keep
Playwright's assertions for those behaviors.

The injected code consists only of Bronto Layout's own audited capture and
open-shadow-root-selector functions and a JSON-encoded selector map; the test
must not pass arbitrary JavaScript. Browser CSP/iframe restrictions are not
bypassed. As with the CLI, a result only covers visited selectors and the
observed viewport. Use separate tests for paints, accessibility, closed shadow
roots and skipped/unobserved states. Retain reports locally if they may include
private DOM paths or styles. For cross-browser Playwright execution, verify
against the actual target engines before claiming compatibility.
