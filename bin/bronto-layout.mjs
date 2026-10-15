#!/usr/bin/env node
/** Bronto Layout CLI: intentionally independent from Playwright, Puppeteer and UI frameworks. */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { serveTarget } from './local-fixture-server.mjs';
import { chromeExecutable } from './chrome-detect.mjs';
import { startBrowser } from './chromium-session.mjs';
import { rejectUninspectableCspSandbox } from './csp-navigation.mjs';
import { captureDOMGeometry } from '../dist/browser.js';
import { queryComposedElements } from '../dist/composed-selector.js';
import { discoverPageSelectors } from '../dist/selector-discovery.js';
import { suggestLayoutContracts, acceptContractProposals } from '../dist/contract-discovery.js';
import { reviewContractProposals } from '../dist/proposal-review.js';
import { describeSuggestedContracts, describeProposalReview, describeApprovedContract } from '../dist/workflow-guidance.js';
import { captureContainerQueryEvidence } from '../dist/container-queries.js';
import { parseContract, validWidth } from '../dist/contract.js';
import { parseLayoutActions } from '../dist/actions.js';
import { pointerClick } from './pointer-click.mjs';
import { evaluateLayout } from '../dist/core.js';
import { compareReports } from '../dist/compare.js';
import { toSarif } from '../dist/sarif.js';
import { sweepLayout } from '../dist/sweep.js';
import { mediaBreakpointSamples, combineCSSBreakpointSamples } from '../dist/breakpoints.js';
import { compactCheckReport, compactCompareReport } from '../dist/agent-report.js';
import { inspectCSSWithCDP } from '../dist/css-inspector.js';
import { selectCSSFailureAliases } from '../dist/css-failure-leads.js';
import { compareLayoutGeometry, truncatedGeometryAliases } from '../dist/geometry-stability.js';
import { installLayoutShiftCollector, summarizeLayoutShifts } from '../dist/layout-shifts.js';
import { verifyPairedAuditEvidence, sameEvidenceFile } from './audit-evidence-verify.mjs';
import { HELP, argsFromCLI, withApprovedScenario, scenarioFromExplicitFlags,
  configFromArgs, getWidths, validateCommandOptions } from './cli-options.mjs';
import { createAuditCommand } from './audit-command.mjs';
import { createBatchCommand } from './batch-command.mjs';


const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
/** Resolve the very same open-shadow selector syntax in every browser operation. */
function geometryExpression(selectors) {
  return `(${captureDOMGeometry.toString()})(${JSON.stringify(selectors)}, (${queryComposedElements.toString()}))`;
}

/**
 * Opt-in geometry quiet window. Repeatedly compare with the geometry at the
 * start of the current quiet period, so slow cumulative drift is not missed.
 * A bounded snapshot cannot establish that all matching elements are stable.
 */
async function waitForStableGeometry(cdp, selectors, initial, stableForMs, timeoutMs) {
  const sample = () => cdp.eval(geometryExpression(selectors));
  const rejectPartial = snapshot => {
    const truncated = truncatedGeometryAliases(snapshot);
    if (truncated.length) throw new Error(
      'Geometry stabilization unavailable: selectors have more matches than measured elements: ' +
      truncated.slice(0, 8).join(', ') + '. Narrow the selectors.'
    );
  };
  rejectPartial(initial);
  const start = Date.now();
  let quietStart = start;
  let reference = initial;
  let current = initial;
  let samples = 1;
  let changesObserved = 0;
  let largestObservedDeltaPx = 0;
  let lastChangedAliases = [];
  const epsilonPx = 0.5;
  const pollMs = 100;
  while (Date.now() - quietStart < stableForMs) {
    if (Date.now() - start >= timeoutMs || samples >= 120) {
      throw new Error(
        'DOM geometry did not stabilize for ' + stableForMs + 'ms within ' + timeoutMs +
        'ms after ' + samples + ' samples. Latest changed selectors: ' +
        (lastChangedAliases.join(', ') || '(none)')
      );
    }
    await pause(pollMs);
    const next = await sample();
    if (!next?.viewport) throw new Error('Browser did not return a layout snapshot while waiting for stability');
    rejectPartial(next);
    samples++;
    const compared = compareLayoutGeometry(reference, next, epsilonPx);
    if (!compared.stable) {
      changesObserved++;
      largestObservedDeltaPx = Math.max(largestObservedDeltaPx, compared.maxDeltaPx);
      lastChangedAliases = compared.changedAliases.slice(0, 8);
      quietStart = Date.now();
      reference = next;
    }
    current = next;
  }
  current.stabilization = {
    status: 'stable', stableForMs,
    waitedMs: Date.now() - start,
    samples, changesObserved, largestObservedDeltaPx, epsilonPx
  };
  return current;
}

async function measure(cdp, url, width, selectors, config, fixtureHTML, actions = []) {
  // Respect CSS preference variants before navigating, so initial styles and
  // media-query evaluation use the requested environment throughout each sample.
  const features = [];
  if (config.colorScheme) features.push({ name: 'prefers-color-scheme', value: config.colorScheme });
  if (config.reducedMotion) features.push({ name: 'prefers-reduced-motion', value: 'reduce' });
  if (features.length) await cdp.send('Emulation.setEmulatedMedia', { features });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: config.height, deviceScaleFactor: config.mobile ? 2 : 1, mobile: config.mobile });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: config.mobile, maxTouchPoints: 5 });
  if (config.locale) {
    await cdp.send('Emulation.setLocaleOverride', { locale: config.locale });
    await cdp.send('Network.setExtraHTTPHeaders', { headers: { 'Accept-Language': config.locale } });
  }
  const loaded = cdp.event('Page.domContentEventFired', config.timeout);
  const responses = [];
  const unlisten = cdp.listen('Network.responseReceived', event => {
    if (event.type === 'Document') responses.push(event);
  });
  try {
    const navigated = await cdp.send('Page.navigate', { url });
    if (navigated.errorText) {
      if (navigated.errorText === 'net::ERR_BLOCKED_BY_ADMINISTRATOR' && process.env.BRONTO_TEST_INLINE_FIXTURE === '1' && fixtureHTML !== undefined) {
        // ONLY for intentionally self-contained test HTML in restricted CI sandboxes.
        // Production navigation must never silently fall back to incomplete DOM/styles.
        loaded.cancel(); loaded.promise.catch(() => {});
        await cdp.eval(`(() => { document.open(); document.write(${JSON.stringify(fixtureHTML)}); document.close(); return true; })()`);
      } else throw new Error(`Could not navigate: ${navigated.errorText}`);
    } else {
      await loaded.promise;
      // A 404 is a rendered DOM too; never allow a passing layout report against an error page.
      const mainResponse = responses.filter(event => event.frameId === navigated.frameId).at(-1);
      if (mainResponse?.response?.status >= 400) {
        throw new Error(`Navigation returned HTTP ${mainResponse.response.status} for ${mainResponse.response.url}`);
      }
      rejectUninspectableCspSandbox(mainResponse?.response);
    }
  } catch (error) {
    loaded.cancel(); loaded.promise.catch(() => {});
    throw error;
  } finally { unlisten(); }
  const readySelector = JSON.stringify(config.readySelector ?? '');
  const resolveSelector = queryComposedElements.toString();
  await cdp.eval(`(async () => {
    const readySelector = ${readySelector};
    const find = (${resolveSelector});
    if (readySelector) {
      const deadline = performance.now() + ${config.timeout};
      while (!find(readySelector).length) {
        if (performance.now() >= deadline) throw new Error('Ready selector not found: ' + readySelector);
        await new Promise(r => setTimeout(r, 50));
      }
    }
    if (document.fonts) await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))]);
    if (${config.settle} > 0) await new Promise(r => setTimeout(r, ${config.settle}));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return true;
  })()`);
  for (const action of actions) await runAction(cdp, action, config.timeout);
  let snapshot = await cdp.eval(geometryExpression(selectors));
  if (!snapshot?.viewport) throw new Error('Browser did not return a layout snapshot');
  if (config.stableFor) snapshot = await waitForStableGeometry(cdp, selectors, snapshot, config.stableFor, config.timeout);
  if (config.collectShifts) {
    const raw = await cdp.eval('globalThis.__brontoLayoutShiftCollector?.read?.()');
    snapshot.layoutShifts = summarizeLayoutShifts(raw);
  }
  return snapshot;
}
/** Execute only explicitly declared browser actions; no arbitrary JS from the contract. */
async function runAction(cdp, action, timeout) {
  if (action.type === 'pointer-click')
    return pointerClick(cdp, action.selector, timeout, queryComposedElements);
  const args = JSON.stringify(action);
  const resolveSelector = queryComposedElements.toString();
  await cdp.eval(`(async () => {
    const action = ${args};
    const find = (${resolveSelector});
    if (action.type === 'pause') { await new Promise(r => setTimeout(r, action.milliseconds)); return; }
    const deadline = performance.now() + ${timeout};
    let element;
    while (!(element = find(action.selector)[0])) {
      if (performance.now() >= deadline) throw new Error('Action element not found: ' + action.selector);
      await new Promise(r => setTimeout(r, 50));
    }
    if (action.type === 'click') element.click();
    else if (action.type === 'fill') {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement))
        throw new Error('Fill requires input or textarea: ' + action.selector);
      const proto = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, action.value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (action.type === 'scroll-into-view') element.scrollIntoView({ block: 'center' });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  })()`);
}
function resolveURL(a, spec) {
  const raw = a.url ?? spec?.url;
  if (!raw) throw new Error('Provide --url URL (or a URL in --spec)');
  if (/^https?:\/\//.test(raw) || /^file:\/\//.test(raw)) return raw;
  return path.resolve(a.url ? process.cwd() : path.dirname(path.resolve(a.spec)), raw);
}
async function withBrowser(url, a, execute, scenario) {
  const config = configFromArgs(withApprovedScenario(a, scenario));
  const target = await serveTarget(url);
  let browser;
  try {
    browser = await startBrowser(chromeExecutable(a.chrome), config.timeout, Boolean(a['no-sandbox'] || process.env.BRONTO_CHROME_NO_SANDBOX === '1'));
    if (config.collectShifts) {
      // Install before navigation. The current about:blank document also gets
      // instrumentation for explicit restricted-fixture document.write fallback.
      const source = '(' + installLayoutShiftCollector.toString() + ')();';
      await browser.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source });
      await browser.cdp.eval(source);
    }
    const fixture = process.env.BRONTO_TEST_INLINE_FIXTURE === '1' && target.sourcePath ? await readFile(target.sourcePath, 'utf8') : undefined;
    return await execute(browser.cdp, target.url, config, fixture, target.sourcePath ? pathToFileURL(target.sourcePath).href : target.url);
  } finally { await browser?.close(); target.close(); }
}
function hasUnmeasuredRules(reports) {
  return reports.some(report => report.findings.some(f => f.status === 'skip' && f.code === 'measurement-unavailable'));
}

/** Discover media-query thresholds in the same CDP session used for measuring.
 * Inspect both ends of the scan: apps may load different stylesheets by width.
 * Dynamic JS- or container-query breakpoints are outside this CSS-only feature.
 */
async function discoverCSSBreakpointWidths(cdp, url, coarseWidths, config, fixture, actions = []) {
  const range = [...coarseWidths].sort((a, b) => a - b);
  const min = range[0], max = range.at(-1);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const sources = [];
  for (const width of new Set([min, max])) {
    await measure(cdp, url, width, {}, config, fixture, actions);
    let data;
    try { data = await cdp.send('CSS.getMediaQueries'); }
    catch (error) { throw new Error('--css-breakpoints requires CSS.getMediaQueries: ' + error.message); }
    sources.push(mediaBreakpointSamples(data.medias ?? [], min, max));
  }
  const discovered = combineCSSBreakpointSamples(coarseWidths, ...sources);
  if (discovered.widths.length > config.maxSamples) {
    throw new Error(`CSS breakpoint sweep has ${discovered.widths.length} widths, exceeding --max-samples ${config.maxSamples}; shorten --scan range`);
  }
  return discovered;
}
function summary(reports) {
  return reports.reduce((total, report) => ({
    passed: total.passed + report.summary.passed, failed: total.failed + report.summary.failed,
    skipped: total.skipped + report.summary.skipped
  }), { passed: 0, failed: 0, skipped: 0 });
}
async function output(a, data, printable, sarif) {
  const payload = a.sarif ? sarif : data;
  if (a.sarif && !sarif) throw new Error('SARIF is supported for check and compare, not this command');
  if (a.report) {
    const destination = path.resolve(a.report);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  }
  if (a.json || a.sarif) console.log(JSON.stringify(payload, null, 2));
  else console.log(printable);
}
/** Evidence is opt-in, screenshot-bound, and capped; it is not a broad screenshot-testing framework.
 *  Drawing happens in a temporary DOM overlay after measurement, and is always removed.
 */
async function saveEvidence(cdp, snapshot, failures, width, a, label) {
  if (!a['evidence-dir']) return undefined;
  const elementsByPath = new Map(Object.values(snapshot.selectors).flat().map(element => [element.path, element]));
  const marks = new Map();
  for (const finding of failures) {
    for (const elementPath of finding.paths ?? []) {
      const geometry = elementsByPath.get(elementPath);
      if (!geometry) continue;
      const existing = marks.get(elementPath) ?? { ...geometry.rect, paths: [elementPath], ruleIds: [] };
      existing.ruleIds.push(finding.id);
      marks.set(elementPath, existing);
    }
  }
  // A document-overflow rule may have no named element; the screenshot still provides visual context.
  const highlighted = [...marks.values()].map(item => ({ x: item.x, y: item.y, width: item.width, height: item.height,
    label: [...new Set(item.ruleIds)].slice(0, 3).join(', ') })).slice(0, 24);
  await cdp.eval(`(() => {
    document.getElementById('__bronto_layout_evidence')?.remove();
    const markups = ${JSON.stringify(highlighted)};
    const root = document.createElement('div'); root.id = '__bronto_layout_evidence';
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;isolation:isolate;font:12px system-ui';
    const banner = document.createElement('div'); banner.textContent = 'BRONTO LAYOUT · ${label} · ${width}px';
    banner.style.cssText = 'position:absolute;left:8px;top:8px;background:#7f1d1d;color:white;padding:6px 9px;border-radius:3px;font-weight:700;z-index:2';
    root.append(banner);
    for (const m of markups) {
      const box = document.createElement('div');
      box.style.cssText = 'position:absolute;box-sizing:border-box;border:2px solid #e11d48;background:rgba(225,29,72,.08);' +
        'left:' + m.x + 'px;top:' + m.y + 'px;width:' + m.width + 'px;height:' + m.height + 'px';
      const title = document.createElement('div'); title.textContent = m.label;
      title.style.cssText = 'position:absolute;left:0;bottom:100%;background:#e11d48;color:white;white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis;padding:2px 4px';
      box.append(title); root.append(box);
    }
    document.documentElement.append(root);
    return true;
  })()`);
  try {
    const image = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
    if (!image?.data) throw new Error('Browser did not return screenshot bytes');
    const directory = path.resolve(a['evidence-dir']);
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, `${label}-${width}px.png`);
    await writeFile(file, Buffer.from(image.data, 'base64'));
    return file;
  } finally {
    await cdp.eval("(() => { document.getElementById('__bronto_layout_evidence')?.remove(); return true; })()");
  }
}
function selectorsForInspect(flags) {
  const values = flags.selector ?? [];
  if (!values.length) return { root: 'body', header: 'header', main: 'main', footer: 'footer' };
  const selectors = {};
  for (const item of values) {
    const equals = item.indexOf('=');
    if (equals <= 0 || !item.slice(equals + 1).trim()) throw new Error(`Invalid --selector ${item}; expected name=CSS`);
    const alias = item.slice(0, equals);
    if (alias === 'viewport' || Object.hasOwn(selectors, alias)) throw new Error(`Invalid or repeated selector alias: ${alias}`);
    selectors[alias] = item.slice(equals + 1);
  }
  return selectors;
}
async function check(a) {
  if (!a.spec) throw new Error('check requires --spec FILE');
  const spec = parseContract(JSON.parse(await readFile(a.spec, 'utf8')));
  const widths = getWidths(a, spec);
  if (!widths.every(validWidth)) throw new Error('Invalid viewport widths');
  const shiftMode = Boolean(a['layout-shifts'] || spec.rules.some(rule => rule.type === 'layout-stability'));
  const result = await withBrowser(resolveURL(a, spec), { ...a, 'layout-shifts': shiftMode }, async (cdp, url, config, fixture, publicURL) => {
    const cssBreakpoints = a['css-breakpoints']
      ? await discoverCSSBreakpointWidths(cdp, url, widths, config, fixture, spec.actions)
      : undefined;
    const sampledWidths = cssBreakpoints?.widths ?? widths;
    const evidence = [];
    const cssSourceLeads = [];
    let omittedCSSSourceWidths = 0;
    const checked = await sweepLayout(sampledWidths, async width => {
      const snapshot = await measure(cdp, url, width, spec.selectors, config, fixture, spec.actions);
      const report = evaluateLayout(snapshot, spec.rules);
      if (a['css-sources'] && report.summary.failed) {
        // Only collect matched author CSS on failing widths/aliases. A missing
        // element or document overflow may have no attributable named element.
        if (cssSourceLeads.length >= 8) {
          omittedCSSSourceWidths++;
        } else {
          const selected = selectCSSFailureAliases(report, spec.selectors);
          const inspection = Object.keys(selected.selectors).length
            ? await inspectCSSWithCDP(cdp, selected.selectors, snapshot)
            : undefined;
          cssSourceLeads.push({
            width, ruleIdsByAlias: selected.ruleIdsByAlias,
            unattributedRuleIds: selected.unattributedRuleIds,
            ...(inspection ? { inspection } : {})
          });
        }
      }
      if (report.summary.failed && evidence.length < 12 && a['evidence-dir']) {
        const screenshot = await saveEvidence(cdp, snapshot, report.findings.filter(f => f.status === 'fail'), width, a, 'check');
        if (screenshot) evidence.push({ width, screenshot });
      }
      return report;
    }, Boolean(a.refine), config.maxSamples, config.interiorProbes);
    const total = summary(checked.reports);
    if (total.passed + total.failed === 0) {
      const error = new Error('No applicable layout rules were evaluated at the sampled viewport widths; all rules were outside their declared width ranges or otherwise unmeasured. Choose appropriate widths or review the contract; this is unverified, not a passing layout.');
      error.code = 'NO_APPLICABLE_RULES';
      throw error;
    }
    return { schemaVersion: 1, mode: 'check', url: publicURL, summary: total, reports: checked.reports, transitions: checked.transitions, sampling: checked.sampling,
      ...(cssBreakpoints ? { cssBreakpointScan: cssBreakpoints } : {}),
      ...(a['css-sources'] ? { cssSourceLeads, omittedCSSSourceWidths } : {}),
      ...(a['evidence-dir'] ? { evidence } : {}) };
  }, spec.scenario);
  const printable = [
    `Bronto Layout — ${result.url}`,
    ...(result.cssBreakpointScan ? [`CSS thresholds: ${result.cssBreakpointScan.thresholds.join(', ') || 'none'}; additional widths: ${result.cssBreakpointScan.addedWidths.join(', ') || 'none'}`] : []),
    ...result.reports.filter(r => r.stabilization).map(r => '  ' + r.viewport.width + 'px geometry stable for ' + r.stabilization.stableForMs + 'ms after ' + r.stabilization.waitedMs + 'ms / ' + r.stabilization.samples + ' samples'),
    ...result.reports.filter(r => r.layoutShifts).map(r => '  ' + r.viewport.width + 'px layout stability: ' + (r.layoutShifts.supported ? r.layoutShifts.maxSessionScore.toFixed(6) + ' max-session score' : 'unavailable (' + r.layoutShifts.reason + ')')),
    ...result.reports.map(r => `${r.viewport.width}px (${r.viewport.direction}): ${r.summary.passed} passed, ${r.summary.failed} failed, ${r.summary.skipped} skipped`),
    ...result.reports.flatMap(r => r.findings.filter(f => f.status === 'fail' || (a['fail-on-skip'] && f.code === 'measurement-unavailable')).map(f => `  ${r.viewport.width}px ${f.status.toUpperCase()} ${f.id}: ${f.message}`)),
    ...(result.cssSourceLeads ? result.cssSourceLeads.map(item =>
      '  ' + item.width + 'px matched CSS hints: ' +
      (Object.keys(item.ruleIdsByAlias).join(', ') || 'no attributable aliases') +
      ' (use --json for declarations)') : []),
    ...(result.transitions.length ? ['Observed transitions:', ...result.transitions.map(t => `  ${t.ruleId}: ${t.from} → ${t.to}, ${t.previousWidth}–${t.width}px (${t.precision})`)] : []),
    `Total: ${result.summary.failed} failed, ${result.summary.passed} passed, ${result.summary.skipped} skipped`
  ].join('\n');
  await output(a, a.compact ? compactCheckReport(result) : result, printable, toSarif(result.url, result.reports));
  if (result.summary.failed || (a['fail-on-skip'] && hasUnmeasuredRules(result.reports))) process.exitCode = 1;
}
async function inspect(a) {
  const selectors = selectorsForInspect(a);
  const widths = getWidths(a);
  if (a.refine) throw new Error('--refine applies only to check or scan with a contract');
  const result = await withBrowser(resolveURL(a), a, async (cdp, url, config, fixture, publicURL) => {
    const snapshots = [];
    const evidence = [];
    const cssSources = [];
    const containerQueries = [];
    for (const width of widths) {
      const snapshot = await measure(cdp, url, width, selectors, config, fixture);
      snapshots.push(snapshot);
      if (a['css-sources']) cssSources.push(await inspectCSSWithCDP(cdp, selectors, snapshot));
      if (a['container-queries']) {
        const details = await cdp.eval('(' + captureContainerQueryEvidence.toString() + ')()');
        if (!details || details.supported !== true) {
          throw new Error('--container-queries requires a browser with CSSContainerRule support');
        }
        containerQueries.push({ width, ...details });
      }
      if (evidence.length < 12 && a['evidence-dir']) {
        const paths = Object.values(snapshot.selectors).flat().slice(0, 24).map(el => el.path);
        const screenshot = await saveEvidence(cdp, snapshot, [{ id: 'selected elements', paths }], width, a, 'inspect');
        if (screenshot) evidence.push({ width, screenshot });
      }
    }
    return { schemaVersion: 1, mode: 'inspect', url: publicURL, snapshots,
      ...(a['css-sources'] ? { cssSources } : {}),
      ...(a['container-queries'] ? { containerQueries } : {}),
      ...(a['evidence-dir'] ? { evidence } : {}) };
  });
  const text = [
    `Bronto Layout inspection — ${result.url}`,
    ...result.snapshots.flatMap(s => [
      `${s.viewport.width}px · ${s.viewport.direction} · document ${s.document.width}×${s.document.height} · overflow ${Math.max(0, s.document.width - (s.viewport.contentWidth ?? s.viewport.width))}px`,
      ...Object.entries(s.selectors).flatMap(([alias, elements]) => [
        `  ${alias} — ${s.selectorCounts?.[alias] ?? elements.length} visible match(es)${(s.selectorCounts?.[alias] ?? elements.length) > elements.length ? ', ' + elements.length + ' measured' : ''}`,
        ...elements.slice(0, 20).map(el => `    ${el.path} [${[el.rect.x, el.rect.y, el.rect.width, el.rect.height].map(n => Number(n.toFixed(2))).join(', ')}]`),
        ...(elements.length > 20 ? [`    ... ${elements.length - 20} more (see JSON output)`] : [])
      ])
    ])
  ].join('\n');
  const geometryWaits = result.snapshots.filter(s => s.stabilization).map(s => '  ' + s.viewport.width + 'px geometry stable for ' + s.stabilization.stableForMs + 'ms after ' + s.stabilization.waitedMs + 'ms');
  const shifts = result.snapshots.filter(s => s.layoutShifts).map(s => '  ' + s.viewport.width + 'px layout stability: ' + (s.layoutShifts.supported ? s.layoutShifts.maxSessionScore.toFixed(6) + ' max-session score, ' + s.layoutShifts.shiftCount + ' non-input shifts' : 'unavailable (' + s.layoutShifts.reason + ')'));
  const sourceLines = result.cssSources?.flatMap(item => [
    item.width + 'px matched CSS source hints:',
    ...item.aliases.flatMap(alias => [
      '  ' + alias.alias + ': ' + alias.inspectedCount + '/' + alias.matchedCount +
        ' matched DOM elements inspected' + (alias.omittedElements ? ' (truncated)' : ''),
      ...alias.elements.flatMap(el => el.status === 'ok'
        ? el.rules.map(rule => {
          const line = rule.declarations.find(declaration => declaration.line)?.line;
          const location = rule.sourceUrl ? rule.sourceUrl + (line ? ':' + line : '')
            : rule.documentUrl ? rule.sourceKind + ' in ' + rule.documentUrl : rule.sourceKind;
          return '    ' + rule.selector + ': ' +
            rule.declarations.map(declaration => declaration.name).join(', ') +
            ' (' + location + ')';
        })
        : ['    CSS unavailable: ' + el.reason])
    ])
  ]) ?? [];
  const containerLines = result.containerQueries?.flatMap(item => [
    '  ' + item.width + 'px CSS containers: ' + item.namedOrSizedContainers +
      ' measured, ' + item.discoveredRules + ' @container rules, ' +
      item.stylesheetsInaccessible + ' inaccessible stylesheets' +
      (item.containersTruncated || item.rulesTruncated ? ' (INCOMPLETE)' : ''),
    ...item.rules.slice(0, 16).map(rule =>
      '    ' + (rule.name || '(unnamed)') + ' ' + rule.query +
      ' [conditional container width, not viewport breakpoints]')
  ]) ?? [];
  await output(a, result, [text, ...geometryWaits, ...shifts, ...sourceLines, ...containerLines].join('\n'));
}
async function init(a) {
  const file = path.resolve(a.out ?? 'bronto-layout.json');
  if (!a.force && existsSync(file)) throw new Error(`${file} exists; use --force to overwrite`);
  const data = {
    schemaVersion: 1,
    url: a.url ?? 'http://127.0.0.1:5173/',
    widths: [320, 375, 768, 1280],
    selectors: { page: 'body', main: 'main' },
    rules: [
      { id: 'horizontal-overflow', type: 'document-overflow', tolerance: 1 },
      { id: 'main-exists', type: 'selector-count', element: 'main', min: 1 }
    ]
  };
  // The starter contract is only a template; the user should revise rules to match their site's intent.
  await writeFile(file, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf8', flag: a.force ? 'w' : 'wx' });
  await output(a, { schemaVersion: 1, mode: 'init', file }, `Created ${file}. Adjust selectors and layout intent before use.`);
}
async function compare(a) {
  if (!a.spec) throw new Error('compare requires --spec FILE');
  if (!a.baseline || !a.url) throw new Error('compare requires --baseline URL and --url URL');
  const spec = parseContract(JSON.parse(await readFile(a.spec, 'utf8')));
  const widths = getWidths(a, spec);
  if (!widths.every(validWidth)) throw new Error('Invalid viewport widths');
  const candidatePath = resolveURL(a, spec);
  const baselinePath = /^https?:\/\//.test(a.baseline) || /^file:\/\//.test(a.baseline) ? a.baseline : path.resolve(a.baseline);
  const shiftMode = Boolean(a['layout-shifts'] || spec.rules.some(rule => rule.type === 'layout-stability'));
  const result = await withBrowser(candidatePath, { ...a, 'layout-shifts': shiftMode }, async (cdp, candidateUrl, config, fixture, publicURL) => {
    const baselineTarget = await serveTarget(baselinePath);
    const baselineFixture = process.env.BRONTO_TEST_INLINE_FIXTURE === '1' && baselineTarget.sourcePath ? await readFile(baselineTarget.sourcePath, 'utf8') : undefined;
    try {
      // Compare CSS breakpoints from BOTH revisions: a newly introduced
      // breakpoint may be the source of a regression.
      const cssBreakpoints = a['css-breakpoints']
        ? combineCSSBreakpointSamples(widths,
          await discoverCSSBreakpointWidths(cdp, baselineTarget.url, widths, config, baselineFixture, spec.actions),
          await discoverCSSBreakpointWidths(cdp, candidateUrl, widths, config, fixture, spec.actions))
        : undefined;
      if (cssBreakpoints && cssBreakpoints.widths.length > config.maxSamples) {
        throw new Error(`CSS breakpoint comparison has ${cssBreakpoints.widths.length} widths, exceeding --max-samples ${config.maxSamples}`);
      }
      const sampledWidths = cssBreakpoints?.widths ?? widths;
      // A shared browser measures both revisions with exactly the same viewport and browser engine.
      // Each sample fully navigates again to avoid stale page geometry between revisions.
      const baseSnapshots = new Map();
      const candidateSnapshots = new Map();
      const evidence = [];
      const sweep = await sweepLayout(sampledWidths, async width => {
        const baseline = evaluateLayout(await measure(cdp, baselineTarget.url, width, spec.selectors, config, baselineFixture, spec.actions), spec.rules);
        const candidateGeometry = await measure(cdp, candidateUrl, width, spec.selectors, config, fixture, spec.actions);
        const candidate = evaluateLayout(candidateGeometry, spec.rules);
        if (a['evidence-dir'] && evidence.length < 12) {
          const singleWidth = compareReports(baselineTarget.url, candidateUrl, [baseline], [candidate]);
          const failures = candidate.findings.filter(f => singleWidth.changes.some(c => c.ruleId === f.id && c.kind === 'regression'));
          if (failures.length) {
            const screenshot = await saveEvidence(cdp, candidateGeometry, failures, width, a, 'compare');
            if (screenshot) evidence.push({ width, screenshot });
          }
        }
        baseSnapshots.set(width, baseline);
        candidateSnapshots.set(width, candidate);
        // A combined signature refines transitions in *either* revision, not only the candidate.
        return {
          viewport: candidate.viewport,
          summary: candidate.summary,
          findings: [
            ...baseline.findings.map(f => ({ ...f, id: `baseline:${f.id}` })),
            ...candidate.findings.map(f => ({ ...f, id: `candidate:${f.id}` }))
          ]
        };
      }, Boolean(a.refine), config.maxSamples, config.interiorProbes);
      const selectedWidths = sweep.reports.map(r => r.viewport.width);
      const comparison = compareReports(baselineTarget.sourcePath ? pathToFileURL(baselineTarget.sourcePath).href : baselineTarget.url, publicURL,
        selectedWidths.map(width => baseSnapshots.get(width)), selectedWidths.map(width => candidateSnapshots.get(width)));
      return { ...comparison, sampling: sweep.sampling, ...(cssBreakpoints ? { cssBreakpointScan: cssBreakpoints } : {}),
        ...(a['evidence-dir'] ? { evidence } : {}) };
    } finally { baselineTarget.close(); }
  }, spec.scenario);
  const important = result.changes.filter(c => c.kind !== 'unchanged');
  const printable = [
    `Bronto Layout comparison — ${result.baselineUrl} → ${result.candidateUrl}`,
    ...(result.cssBreakpointScan ? [`CSS thresholds: ${result.cssBreakpointScan.thresholds.join(', ') || 'none'}; additional widths: ${result.cssBreakpointScan.addedWidths.join(', ') || 'none'}`] : []),
    ...important.map(c => `  ${c.width}px ${c.kind.toUpperCase()} ${c.ruleId}: ${c.baselineStatus} → ${c.candidateStatus}${c.errorDelta === undefined ? '' : `, error Δ ${c.errorDelta.toFixed(2)}${c.errorUnit}`}`),
    `Total: ${result.summary.regressions} regressions, ${result.summary.improvements} improvements, ${result.summary.unverified} unverified, ${result.summary.candidateFailures} candidate violations remaining`
  ].join('\n');
  await output(a, a.compact ? compactCompareReport(result) : result, printable, toSarif(result.candidateUrl, result.candidate, result));
  if (result.summary.regressions || (a['fail-on-skip'] && (result.summary.unverified || hasUnmeasuredRules(result.candidate)))) process.exitCode = 1;
}
/** Read validated, bounded declarative state setup without executing arbitrary JS.
 * The source file is not copied to a report; actions might include user input.
 */
async function readExplicitActions(a) {
  return a.actions ? parseLayoutActions(JSON.parse(await readFile(path.resolve(a.actions), 'utf8'))) : [];
}

// Audit-only browser orchestration lives outside the shared CLI and contract
// runners. The injected seam keeps browser ownership and policy in one place.
const audit = createAuditCommand({
  measure, withBrowser, resolveURL, discoverCSSBreakpointWidths,
  output, readExplicitActions
});

const batch = createBatchCommand({ output });
/** Suggestions never become enforced contracts without a separate approval. */
async function suggest(a) {
  if (!a.url) throw new Error('suggest requires --url URL or local HTML path');
  const widths = a.width !== undefined || a.widths !== undefined || a.scan
    ? getWidths(a) : [375, 768, 1280];
  const actions = await readExplicitActions(a);
  const draft = await withBrowser(resolveURL(a), a, async (cdp, url, config, fixture, publicURL) => {
    if (widths.length > config.maxSamples) throw new Error('Too many suggestion widths');
    const explicit = Boolean(a.selector?.length);
    let selectors, groups = [], truncated = false, limitReasons = [];
    if (explicit) selectors = selectorsForInspect(a);
    else {
      await measure(cdp, url, widths[0], { page: 'body' }, config, fixture, actions);
      const discovered = await cdp.eval('(' + discoverPageSelectors.toString() + ')()');
      if (!discovered?.selectors || typeof discovered.candidatesTruncated !== 'boolean')
        throw new Error('Selector discovery unavailable');
      selectors = discovered.selectors;
      groups = discovered.groupAliases;
      truncated = discovered.candidatesTruncated;
      limitReasons = discovered.limitReasons ?? [];
    }
    const snapshots = [];
    for (const width of widths) snapshots.push(await measure(cdp, url, width, selectors, config, fixture, actions));
    if (explicit) groups = Object.keys(selectors).filter(alias => snapshots.every(snapshot =>
      (snapshot.selectorCounts?.[alias] ?? 0) >= 3 &&
      snapshot.selectorCounts[alias] === snapshot.selectors[alias]?.length));
    return suggestLayoutContracts(publicURL, selectors, snapshots, groups, truncated, {
      ...(scenarioFromExplicitFlags(a) ? { scenario: scenarioFromExplicitFlags(a) } : {}),
      ...(a.actions ? { actions } : {})
    }, limitReasons);
  });
  if (a.out) {
    const destination = path.resolve(a.out);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, JSON.stringify(draft, null, 2) + '\n', { flag: a.force ? 'w' : 'wx' });
  }
  await output(a, draft, describeSuggestedContracts(draft, a.out ? path.resolve(a.out) : undefined));
}
/** Replay unapproved proposals on a later version without inventing design intent. */
async function reviewDraft(a) {
  if (!a.draft) throw new Error('review-draft requires --draft FILE');
  const draft = JSON.parse(await readFile(a.draft, 'utf8'));
  if (!draft || !Array.isArray(draft.proposals)) throw new Error('Invalid proposal draft');
  if (draft.proposals.length) acceptContractProposals(draft, draft.proposals.map(item => item.id));
  const target = a.url ?? draft?.url;
  if (!target || typeof target !== 'string') throw new Error('Proposal draft has no usable URL; pass --url');
  const result = await withBrowser(target, a, async (cdp, url, config, fixture, publicURL) => {
    if (!Array.isArray(draft.widths) || draft.widths.length > config.maxSamples)
      throw new Error('Proposal draft has missing or excessive viewport widths');
    const snapshots = [];
    for (const width of draft.widths) {
      snapshots.push(await measure(cdp, url, width, draft.selectors ?? {},
        config, fixture, draft.actions ?? []));
    }
    return reviewContractProposals(draft, publicURL, snapshots);
  }, draft.scenario);
  await output(a, result, describeProposalReview(result));
  if (!result.summary.total || result.summary.unverified) process.exitCode = 2;
  else if (result.summary.changed) process.exitCode = 1;
}

async function approve(a) {
  if (!a.draft || !a.accept || !a.out) throw new Error('approve requires --draft FILE, --accept id[,id...], and --out FILE');
  const source = path.resolve(a.draft), destination = path.resolve(a.out);
  if (source === destination) throw new Error('Cannot overwrite the source proposal draft');
  const ids = a.accept.split(',').map(id => id.trim());
  const contract = acceptContractProposals(JSON.parse(await readFile(source, 'utf8')), ids);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(contract, null, 2) + '\n', { flag: a.force ? 'w' : 'wx' });
  await output(a, { mode: 'approve', file: destination, acceptedIds: ids, contract },
    describeApprovedContract(destination, ids.length));
}
/** Version-only install check by default; opt-in launch verifies real local CDP
 * readiness without contacting a site or weakening sandbox flags silently. */
async function doctor(a) {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const nodeSupported = nodeMajor >= 22;
  const verifyLaunch = Boolean(a['verify-launch']);
  let browser;
  try {
    const executable = chromeExecutable(a.chrome);
    const checked = spawnSync(executable, ['--version'], { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 64 });
    if (checked.error || checked.status !== 0) {
      browser = { detected: false, path: executable, reason: checked.error?.message || checked.stderr?.trim() || 'Browser --version failed' };
    } else {
      browser = { detected: true, path: executable, version: checked.stdout.trim() || checked.stderr.trim() };
    }
  } catch (error) {
    browser = { detected: false, reason: error instanceof Error ? error.message : String(error) };
  }

  // Only this explicit opt-in starts a browser. A sandbox bypass must itself
  // be requested by the caller; the default remains Chromium's normal mode.
  const bypass = Boolean(a['no-sandbox'] || process.env.BRONTO_CHROME_NO_SANDBOX === '1');
  if (verifyLaunch) {
    if (nodeSupported && browser.detected) {
      let session;
      try {
        session = await startBrowser(browser.path, configFromArgs(a).timeout, bypass);
        const page = await session.cdp.eval('({ url: location.href, readyState: document.readyState })');
        if (page?.url !== 'about:blank' || !page.readyState)
          throw new Error('Chromium did not return a usable isolated about:blank page through CDP');
        browser.launch = { attempted: true, connected: true,
          sandboxBypassRequested: bypass, page: 'about:blank' };
      } catch (error) {
        browser.launch = { attempted: true, connected: false,
          sandboxBypassRequested: bypass,
          reason: (error instanceof Error ? error.message : String(error)).slice(0, 600) };
      } finally {
        try { await session?.close(); }
        catch (error) {
          browser.launch = { attempted: true, connected: false,
            sandboxBypassRequested: bypass,
            reason: 'Unable to cleanly close the isolated browser profile: '+
              (error instanceof Error ? error.message : String(error)).slice(0, 450) };
        }
      }
    } else {
      browser.launch = { attempted: false, connected: false,
        sandboxBypassRequested: bypass,
        reason: nodeSupported ? 'No detected Chrome/Chromium to launch' : 'Unsupported Node.js version' };
    }
  }

  const status = !nodeSupported || !browser.detected ||
    (verifyLaunch && !browser.launch?.connected) ? 'needs-attention'
    : verifyLaunch ? 'launch-verified' : 'detected';
  const data = { schemaVersion: 1, mode: 'doctor', status,
    node: { version: process.versions.node, supported: nodeSupported },
    platform: process.platform, architecture: process.arch, browser,
    limitations: [
      ...(verifyLaunch ? [
        'Only an isolated local about:blank page and active CDP connection were tested',
        bypass ? 'The browser sandbox bypass was explicitly requested; this is NOT a sandbox verification' :
          'No explicit sandbox bypass was requested; OS-level isolation was not independently verified'
      ] : ['The executable was checked with --version only; Chrome was not launched']),
      'Network navigation, real-site permissions, native physical-device parity and visual correctness remain unverified',
      'Bronto Layout currently supports Chromium-family browsers through CDP'
    ] };
  await output(a, data, [
    'Bronto Layout preflight — ' + status,
    '  Node ' + data.node.version + (nodeSupported ? ' (supported)' : ' (requires >=22)'),
    '  Chromium: ' + (browser.detected ? browser.version + ' at ' + browser.path : browser.reason),
    ...(verifyLaunch ? ['  Isolated CDP launch: '+(browser.launch.connected ?
      'connected to about:blank' : 'FAILED: '+browser.launch.reason),
      '  Sandbox bypass requested: '+(bypass ? 'YES (not a sandbox test)' : 'NO')]
      : ['  Note: pass --verify-launch to test a real isolated Chromium/CDP startup']),
    '  Note: real website navigation, privacy and design quality were not inspected'
  ].join('\n'));
  if (status === 'needs-attention') process.exitCode = 2;
}

async function verifyEvidence(a) {
  const source = path.resolve(a.comparison);
  if (a.report && await sameEvidenceFile(a.report,source)) {
    throw new Error('Verification output --report must not overwrite the input --comparison report');
  }
  const metadata = JSON.parse(await readFile(source,'utf8'));
  const verification = await verifyPairedAuditEvidence(metadata,a['evidence-dir']);
  const message = 'Paired evidence ' + verification.status.toUpperCase() + ': ' +
    verification.summary.verifiedImages + '/' + verification.summary.totalImages +
    ' screenshot hashes verified across ' + verification.summary.pairedWidths +
    ' viewport widths; no layout-quality judgment';
  await output(a,verification,message);
  if (verification.summary.unsafeImages) process.exitCode = 2;
}

async function validate(a) {
  if (!a.spec) throw new Error('validate requires --spec FILE');
  const spec = parseContract(JSON.parse(await readFile(a.spec, 'utf8')));
  const data = { schemaVersion: 1, mode: 'validate', file: path.resolve(a.spec),
    valid: true, widths: spec.widths ?? [], selectors: Object.keys(spec.selectors),
    rules: spec.rules.map(({ id, type }) => ({ id, type })) };
  await output(a, data, `Valid layout contract: ${data.selectors.length} selectors, ${data.rules.length} rules${data.widths.length ? `, ${data.widths.length} widths` : ''}`);
}
async function main() {
  const a = argsFromCLI(process.argv.slice(2));
  if (a.help) { console.log(HELP); return; }
  if (a.version) { const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')); console.log('Bronto Layout ' + pkg.version); return; }
  validateCommandOptions(a);
  if (a.command === 'verify-evidence') await verifyEvidence(a);
  else if (a.command === 'doctor') await doctor(a);
  else if (a.command === 'review-draft') await reviewDraft(a);
  else if (a.command === 'suggest') await suggest(a);
  else if (a.command === 'approve') await approve(a);
  else if (a.command === 'batch') await batch(a);
  else if (a.command === 'init') await init(a);
  else if (a.command === 'validate') await validate(a);
  else if (a.command === 'audit') await audit(a);
  else if (a.command === 'compare') await compare(a);
  else if (a.command === 'inspect') await inspect(a);
  else if (a.command === 'scan') {
    if (!a.scan) throw new Error('scan requires --scan MIN:MAX:STEP');
    await check(a);
  } else await check(a);
}
main().catch(async error => {
  process.exitCode = 2;
  const message = error instanceof Error ? error.message : String(error);
  const code = ['CSP_SANDBOX_UNINSPECTABLE', 'NO_APPLICABLE_RULES'].includes(error?.code)
    ? error.code : 'CLI_ERROR';
  const args = process.argv.slice(2);
  const report = {
    schemaVersion: 1, mode: 'error', status: 'error', exitCode: 2,
    error: { code, message }
  };
  if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else console.error('Bronto Layout: ' + message);
  const index = args.lastIndexOf('--report');
  const pathValue = index >= 0 ? args[index + 1] : args.find(arg => arg.startsWith('--report='))?.slice(9);
  // On ANY failure, never overwrite the source comparison metadata with a
  // failure report. This includes input-parse errors before verifyEvidence().
  const comparisonIndex = args.lastIndexOf('--comparison');
  const comparisonInput = comparisonIndex >= 0 ? args[comparisonIndex + 1] :
    args.find(arg => arg.startsWith('--comparison='))?.slice(13);
  const overlapsInput = Boolean(args[0] === 'verify-evidence' && comparisonInput &&
    !comparisonInput.startsWith('--') && pathValue &&
    await sameEvidenceFile(comparisonInput,pathValue));
  if (pathValue && !pathValue.startsWith('--') && !overlapsInput) {
    try {
      await mkdir(path.dirname(path.resolve(pathValue)), { recursive: true });
      await writeFile(pathValue, JSON.stringify(report, null, 2) + '\n', 'utf8');
    } catch (failure) {
      console.error('Bronto Layout: Could not write failure report: ' + failure.message);
    }
  }
});
