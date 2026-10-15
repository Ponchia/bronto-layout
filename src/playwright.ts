/**
 * Optional Playwright integration. Reuse an existing Playwright page and the
 * standard Bronto geometry evaluator without launching a second browser.
 * There is deliberately NO Playwright import or runtime dependency.
 */
import { captureDOMGeometry } from './browser.js';
import { queryComposedElements } from './composed-selector.js';
import { evaluateLayout, type LayoutReport, type LayoutSnapshot } from './core.js';
import { parseContract, type LayoutContract } from './contract.js';

/** Minimal structural interface accepted by Playwright Page and Frame. */
export interface PlaywrightPageLike {
  evaluate(expression: string): Promise<unknown>;
}

/**
 * Evaluate the current document geometry, exactly as the caller left it.
 * Does NOT navigate, click, scroll, set viewport dimensions or run an audit.
 * A Page inside a disallow-scripts CSP still cannot be injected/verified.
 */
export async function checkPlaywrightPage(
  page: PlaywrightPageLike,
  contractInput: LayoutContract
): Promise<LayoutReport> {
  if (!page || typeof page.evaluate !== 'function')
    throw new Error('checkPlaywrightPage requires an existing Playwright Page/Frame with evaluate()');
  const spec = parseContract(contractInput);
  if (spec.actions?.length) throw new Error(
    'Playwright adapter does not replay contract actions; use the owned Playwright test to set up interactions first'
  );
  if (spec.scenario && Object.keys(spec.scenario).length) throw new Error(
    'Playwright adapter does not apply declared browser scenario; configure locale/viewport/preferences through Playwright first'
  );
  // Evaluate only two audited, library-owned function bodies plus a
  // JSON-encoded selector object. No script text comes from the contract.
  const script = `(() => {
    const query = (${queryComposedElements.toString()});
    const capture = (${captureDOMGeometry.toString()});
    return capture(${JSON.stringify(spec.selectors)}, query);
  })()`;
  const snapshot = await page.evaluate(script) as LayoutSnapshot;
  const width = snapshot?.viewport?.width;
  if (!Number.isInteger(width) || (width as number) < 200 || (width as number) > 10000 ||
      !snapshot?.document || !snapshot.selectors || typeof snapshot.selectors !== 'object')
    throw new Error('Playwright did not return a usable browser geometry snapshot; the result is unverified');
  if (spec.widths?.length && !spec.widths.includes(width))
    throw new Error(`Actual Playwright viewport ${width}px does not match the contract's declared widths; no layout rule was certified`);
  const report = evaluateLayout(snapshot, spec.rules);
  if (report.summary.passed + report.summary.failed === 0)
    throw new Error('No applicable layout rules ran at this Playwright viewport; all were outside their width range or unmeasured');
  return report;
}
