/** Isolated zero-contract audit runner (including baseline/candidate comparison).
 * The shared CLI owns Chromium/CDP sessions, navigation, flags and output;
 * this module owns audit-only evidence, summaries and review classification.
 * No external browser framework or third-party runtime dependency.
 */
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { serveTarget } from './local-fixture-server.mjs';
import { getWidths } from './cli-options.mjs';
import { capturePageAuditObservations } from '../dist/audit-browser.js';
import { captureFrameInventoryWithCDP } from '../dist/frame-inspector.js';
import { planBoundedScreenshot } from '../dist/bounded-screenshot.js';
import { analyzePageAudit, summarizeOptionalReviewCoverage } from '../dist/audit.js';
import { comparePageAudits } from '../dist/audit-compare.js';
import { combineCSSBreakpointSamples } from '../dist/breakpoints.js';
import { renderPairedAuditGallery } from './audit-comparison-gallery.mjs';

/** Capture a verified viewport PNG only when expressly requested.
 * The comparison is not a pixel-diff engine; screenshots are human evidence.
 * Never overwrite an existing file from an earlier reviewer session.
 */
async function savePairedViewport(cdp, evidenceDir, version, width) {
  const image = await cdp.send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: false, fromSurface: true
  });
  if (typeof image?.data !== 'string') throw new Error('Chromium returned no ' + version + ' comparison screenshot');
  const png = Buffer.from(image.data, 'base64');
  const signature = Buffer.from([137,80,78,71,13,10,26,10]);
  if (png.length <= signature.length || !png.subarray(0, 8).equals(signature))
    throw new Error('Chromium returned invalid ' + version + ' comparison PNG evidence');
  const directory = path.resolve(evidenceDir);
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, 'audit-' + version + '-' + width + 'px.png');
  try {
    await writeFile(file, png, { flag: 'wx' });
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error(
      'Comparison screenshot already exists; choose a fresh --evidence-dir to preserve reviewer evidence: ' + file);
    throw error;
  }
  return {file, sha256: createHash('sha256').update(png).digest('hex'), coverage: 'viewport-only'};
}

/** Report which kinds of actions were run, never typed values or selectors. */
export function auditStateSummary(a, actions) {
  return a.actions ? { stateSetup: { actionCount: actions.length,
    actionTypes: actions.map(action => action.type),
    replayedAtEachWidth: true,
    ...(a.baseline ? { replayedOnBothVersions: true } : {}) } } : {};
}

/**
 * The six injected functions are shared runtime primitives from the CLI.
 * Never start another Chromium session or infer unapproved design intent here.
 */
export function createAuditCommand({
  measure, withBrowser, resolveURL, discoverCSSBreakpointWidths,
  output, readExplicitActions
}) {
  /**
   * Conservative no-contract preflight. High-confidence mechanical observations
   * are failures, while potentially intentional clipping is review-only.
   * Incomplete traversal has exit 2, never a misleading "all clear".
   */
  async function captureAuditAt(cdp, url, width, config, fixture, frameInventory = false, actions = [], gridGapReview = false, overlapReview = false) {
    const snapshot = await measure(cdp, url, width, { page: 'body' }, config, fixture, actions);
    const observations = await cdp.eval('(' + capturePageAuditObservations.toString() + ')(' + config.auditDOMLimit + ', ' + Boolean(gridGapReview) + ', ' + Boolean(overlapReview) + ')');
    if (!observations || !Number.isInteger(observations.visitedElements) ||
        typeof observations.truncated !== 'boolean') {
      throw new Error('Browser did not return usable DOM audit observations');
    }
    const report = analyzePageAudit(snapshot, observations);
    return {
      ...report,
      ...(frameInventory ? { frameInventory: await captureFrameInventoryWithCDP(cdp, observations.embeddedFrames) } : {}),
      ...(snapshot.stabilization ? { stabilization: snapshot.stabilization } : {}),
      ...(snapshot.layoutShifts ? { layoutShifts: snapshot.layoutShifts } : {})
    };
  }

  /**
   * Before/after automatic diagnostics without introducing inferred contracts.
   * Both pages are visited at exactly the same widths in one CDP session.
   */
  async function compareAudit(a, coarseWidths, actions = []) {
    const candidatePath = resolveURL(a);
    const baselinePath = a.baseline.startsWith('http://') ||
      a.baseline.startsWith('https://') || a.baseline.startsWith('file://')
      ? a.baseline : path.resolve(a.baseline);
    const result = await withBrowser(candidatePath, a,
      async (cdp, candidateUrl, config, candidateFixture, candidatePublicUrl) => {
        const baselineTarget = await serveTarget(baselinePath);
        const baselineFixture = process.env.BRONTO_TEST_INLINE_FIXTURE === '1' && baselineTarget.sourcePath
          ? await readFile(baselineTarget.sourcePath, 'utf8') : undefined;
        try {
          const cssBreakpoints = a['css-breakpoints']
            ? combineCSSBreakpointSamples(coarseWidths,
              await discoverCSSBreakpointWidths(cdp, baselineTarget.url, coarseWidths, config, baselineFixture, actions),
              await discoverCSSBreakpointWidths(cdp, candidateUrl, coarseWidths, config, candidateFixture, actions))
            : undefined;
          const widths = cssBreakpoints?.widths ?? coarseWidths;
          if (widths.length > config.maxSamples) {
            throw new Error('Automatic audit comparison has ' + widths.length +
              ' widths, exceeding --max-samples ' + config.maxSamples);
          }
          const baselineReports = [], candidateReports = [], comparisonEvidence = [];
          for (const width of widths) {
            baselineReports.push(await captureAuditAt(cdp, baselineTarget.url, width, config, baselineFixture, a['frame-inventory'], actions, a['grid-gap-review'], a['sibling-overlap-review']));
            const baselineEvidence = a['evidence-dir']
              ? await savePairedViewport(cdp, a['evidence-dir'], 'baseline', width) : null;
            candidateReports.push(await captureAuditAt(cdp, candidateUrl, width, config, candidateFixture, a['frame-inventory'], actions, a['grid-gap-review'], a['sibling-overlap-review']));
            if (baselineEvidence) {
              const candidateEvidence = await savePairedViewport(cdp, a['evidence-dir'], 'candidate', width);
              comparisonEvidence.push({ width, baseline: baselineEvidence, candidate: candidateEvidence });
            }
          }
          const comparison = comparePageAudits(
            baselineTarget.sourcePath ? pathToFileURL(baselineTarget.sourcePath).href : baselineTarget.url,
            candidatePublicUrl, baselineReports, candidateReports
          );
          return {
            ...comparison,
            ...(a['evidence-dir'] ? {comparisonEvidence} : {}),
            ...(cssBreakpoints ? { cssBreakpointScan: cssBreakpoints } : {})
          };
        } finally { baselineTarget.close(); }
      });
    const beforeByWidth = new Map(result.baseline.map(report => [report.viewport.width, report]));
    const coverageGaps = result.candidate.flatMap(candidate => {
      const baseline = beforeByWidth.get(candidate.viewport.width);
      if (baseline?.coverage.status === 'supported-scope-measured' &&
          candidate.coverage.status === 'supported-scope-measured') return [];
      return [{ width: candidate.viewport.width,
        baselineStatus: baseline?.coverage.status ?? 'unknown',
        candidateStatus: candidate.coverage.status,
        baselineUninspectedFrames: baseline?.coverage.embeddedFrames ?? 0,
        candidateUninspectedFrames: candidate.coverage.embeddedFrames }];
    });
    result.coverageGaps = coverageGaps;
    if (a['grid-gap-review'] || a['sibling-overlap-review']) {
      const flags = {gridGapReview:Boolean(a['grid-gap-review']),
        siblingOverlapReview:Boolean(a['sibling-overlap-review'])};
      result.reviewCoverage = {
        baseline: summarizeOptionalReviewCoverage(result.baseline,flags),
        candidate: summarizeOptionalReviewCoverage(result.candidate,flags)
      };
    }
    if (result.comparisonEvidence) {
      const file = path.join(path.resolve(a['evidence-dir']), 'audit-comparison.html');
      const gallery = renderPairedAuditGallery(result.comparisonEvidence, a['evidence-dir']);
      try {
        await writeFile(file, gallery, { flag: 'wx' });
      } catch (error) {
        if (error?.code === 'EEXIST') throw new Error(
          'Comparison gallery already exists; choose a fresh --evidence-dir: ' + file);
        throw error;
      }
      result.comparisonGallery = {file, format:'static-offline-html', scripts:false, pairs:result.comparisonEvidence.length};
    }
    Object.assign(result, auditStateSummary(a, actions));
    const remaining = result.candidate.flatMap(report => report.findings
      .filter(f => f.classification === 'measured')
      .map(finding => ({width:report.viewport.width, ...finding})));
    const payload = a.compact ? {
      schemaVersion:result.schemaVersion,mode:'audit-compare',format:'compact',
      baselineUrl:result.baselineUrl,candidateUrl:result.candidateUrl,
      summary:result.summary,sampledWidths:result.sampledWidths,
      changes:result.changes,unverified:result.unverified,coverageGaps,
      ...(result.reviewCoverage ? {reviewCoverage:result.reviewCoverage} : {}),
      ...(result.comparisonEvidence ? {comparisonEvidence:result.comparisonEvidence} : {}),
      ...(result.comparisonGallery ? {comparisonGallery:result.comparisonGallery} : {}),
      ...auditStateSummary(a, actions),
      ...(a['frame-inventory'] ? { frameInventories: result.candidate.map((candidate, i) => ({
        width: candidate.viewport.width, baseline: result.baseline[i].frameInventory,
        candidate: candidate.frameInventory
      })) } : {}),
      remainingMeasuredIssues:remaining.slice(0,100),
      omittedRemainingMeasuredIssues:Math.max(0,remaining.length-100),
      ...(result.cssBreakpointScan ? { cssBreakpointScan:result.cssBreakpointScan } : {})
    } : result;
    const printable = [
      'Bronto Layout zero-contract comparison — '+result.baselineUrl+' → '+result.candidateUrl,
      ...(result.reviewCoverage ? ['  Opt-in review coverage: baseline '+result.reviewCoverage.baseline.status+
        ', candidate '+result.reviewCoverage.candidate.status+'; omissions are NOT clean reviews'] : []),
      ...(a.actions ? ['  Setup: '+actions.length+' validated declarative action(s), replayed independently on both versions at each width; values omitted'] : []),
      ...(result.comparisonEvidence ? result.comparisonEvidence.map(item => '  '+item.width+'px viewport screenshots: baseline '+item.baseline.file+', candidate '+item.candidate.file) : []),
      ...(result.comparisonGallery ? ['  Offline comparison gallery: '+result.comparisonGallery.file] : []),
      ...result.changes.map(change=>
        '  '+change.width+'px '+change.kind.toUpperCase()+' '+change.code+
        (change.path?' ['+change.path+']':'')+
        ': '+change.message),
      ...result.unverified.map(item=>item.width+'px UNVERIFIED: '+item.reasons.join('; ')),
      ...coverageGaps.map(item=>item.width+'px COVERAGE: baseline '+item.baselineStatus+', candidate '+item.candidateStatus+'; inspect known gaps'),
      ...(a['frame-inventory'] ? result.candidate.map(item => item.viewport.width+'px frame inventory: '+item.frameInventory?.observedFrameDocuments+' / '+item.frameInventory?.frameCount+' frame documents observed ('+item.frameInventory?.status+', '+item.frameInventory?.unresolvedDomFrames+' DOM frames unresolved); no inner-frame checks') : []),
      'Total: '+result.summary.measuredRegressions+' measured regressions, '+
        result.summary.measuredImprovements+' improvements, '+
        result.summary.reviewChanges+' review changes and '+
        result.summary.unverifiedViewports+' unverified viewports',
      'Existing candidate issues are not automatically regressions; inspect JSON for remaining issues.'
    ].join('\n');
    await output(a, payload, printable);
    if (result.summary.unverifiedViewports) process.exitCode=2;
    else if (a['fail-on-coverage-gaps'] && [...result.baseline,...result.candidate].some(r => r.coverage.status !== 'supported-scope-measured')) process.exitCode=2;
    else if (result.summary.measuredRegressions) process.exitCode=1;
  }

  async function audit(a) {
    if (!a.url) throw new Error('audit requires --url URL (or a local HTML path)');
    const baseWidths = a.scan || a.width !== undefined || a.widths !== undefined
      ? getWidths(a) : [320, 375, 768, 1280];
    const actions = await readExplicitActions(a);
    if (a.baseline) return compareAudit(a, baseWidths, actions);
    const result = await withBrowser(resolveURL(a), a, async (cdp, url, config, fixture, publicURL) => {
      const cssBreakpoints = a['css-breakpoints']
        ? await discoverCSSBreakpointWidths(cdp, url, baseWidths, config, fixture, actions)
        : undefined;
      const widths = cssBreakpoints?.widths ?? baseWidths;
      if (widths.length > config.maxSamples) throw new Error(
        'Audit selected ' + widths.length + ' viewport widths, exceeding --max-samples ' +
        config.maxSamples
      );
      const reports = [];
      for (const width of widths) {
        // The body is measured for optional geometry stabilization. The separate
        // observer scans all visible top-level DOM/shadow children.
        const report = await captureAuditAt(cdp, url, width, config, fixture, a['frame-inventory'], actions, a['grid-gap-review'], a['sibling-overlap-review']);
        if (a['evidence-dir']) {
          const image = await cdp.send('Page.captureScreenshot', {
            format: 'png', captureBeyondViewport: false, fromSurface: true
          });
          if (!image?.data) throw new Error('Could not capture audit screenshot');
          const directory = path.resolve(a['evidence-dir']);
          await mkdir(directory, { recursive: true });
          const screenshot = path.join(directory, `audit-${width}px.png`);
          await writeFile(screenshot, Buffer.from(image.data, 'base64'));
          report.screenshot = { file: screenshot, coverage: 'viewport-only' };
          if (a['full-page-evidence']) {
            const metrics = await cdp.send('Page.getLayoutMetrics');
            const plan = planBoundedScreenshot(width, metrics);
            const expanded = await cdp.send('Page.captureScreenshot', {
              format: 'png', fromSurface: true, captureBeyondViewport: true,
              clip: plan.clip
            });
            if (!expanded?.data) throw new Error('Chromium returned no bounded document screenshot');
            const expandedPath = path.join(directory, `audit-${width}px-full.png`);
            await writeFile(expandedPath, Buffer.from(expanded.data, 'base64'));
            report.fullPageScreenshot = { file: expandedPath, ...plan };
          }
        }
        reports.push(report);
      }
      const browser = await cdp.eval('({ userAgent: navigator.userAgent, actualUrl: location.href, language: navigator.language })');
      const reviewCoverage = a['grid-gap-review'] || a['sibling-overlap-review']
        ? summarizeOptionalReviewCoverage(reports,{gridGapReview:Boolean(a['grid-gap-review']),
          siblingOverlapReview:Boolean(a['sibling-overlap-review'])}) : undefined;
      const summary = {
        viewports: reports.length,
        ...(reviewCoverage ? {reviewCoverage} : {}),
        measuredIssues: reports.reduce((count, report) => count + report.summary.errors, 0),
        reviewWarnings: reports.reduce((count, report) => count + report.summary.warnings, 0),
        incompleteViewports: reports.filter(report => !report.summary.supportedScopeMeasured).length,
        partialViewports: reports.filter(report => report.coverage.status !== 'supported-scope-measured').length,
        visitedElements: reports.reduce((count, report) => count + report.coverage.visitedElements, 0)
      };
      return { schemaVersion: 1, mode: 'audit', url: publicURL, browser, summary,
        ...auditStateSummary(a, actions),
        sampledWidths: widths, reports,
        ...(cssBreakpoints ? { cssBreakpointScan: cssBreakpoints } : {}) };
    });
    const payload = a.compact ? {
      schemaVersion: result.schemaVersion, mode: 'audit', format: 'compact',
      url: result.url, browser: result.browser, summary: result.summary, sampledWidths: result.sampledWidths,
      ...auditStateSummary(a, actions),
      reports: result.reports.map(report => ({
        width: report.viewport.width,
        direction: report.viewport.direction,
        summary: report.summary,
        coverage: {
          visitedElements: report.coverage.visitedElements,
          traversalLimit: report.coverage.traversalLimit,
          truncated: report.coverage.truncated,
          scope: report.coverage.scope,
          status: report.coverage.status,
          limitations: report.coverage.limitations,
          embeddedFrames: report.coverage.embeddedFrames,
          totalImages: report.coverage.totalImages,
          brokenImageCount: report.coverage.brokenImageCount,
          omittedBrokenImages: report.coverage.omittedBrokenImages,
          textClipCount: report.coverage.textClipCount,
          omittedTextClips: report.coverage.omittedTextClips,
          intentionalEllipses: report.coverage.intentionalEllipses,
          visuallyHiddenTextExcluded: report.coverage.visuallyHiddenTextExcluded,
          ...(a['grid-gap-review'] ? {gridContainersInspected:report.coverage.gridContainersInspected,
            gridContainersOmitted:report.coverage.gridContainersOmitted,gridGapCount:report.coverage.gridGapCount} : {}),
          ...(a['sibling-overlap-review'] ? {
            overlapContainersInspected: report.coverage.overlapContainersInspected,
            overlapContainersOmitted: report.coverage.overlapContainersOmitted,
            siblingOverlapCount: report.coverage.siblingOverlapCount,
            omittedSiblingOverlapLeads: Math.max(0, (report.coverage.siblingOverlapCount ?? 0) - (report.coverage.siblingOverlapLeads?.length ?? 0))
          } : {})
        },
        findings: report.findings,
        ...(report.screenshot ? { screenshot: report.screenshot } : {}),
        ...(report.fullPageScreenshot ? { fullPageScreenshot: report.fullPageScreenshot } : {}),
        ...(report.frameInventory ? { frameInventory: report.frameInventory } : {}),
        ...(report.stabilization ? { stabilization: report.stabilization } : {}),
        ...(report.layoutShifts ? { layoutShifts: {
          supported: report.layoutShifts.supported,
          maxSessionScore: report.layoutShifts.maxSessionScore,
          shiftCount: report.layoutShifts.shiftCount
        } } : {})
      })),
      ...(result.cssBreakpointScan ? { cssBreakpointScan: result.cssBreakpointScan } : {})
    } : result;
    const printable = [
      'Bronto Layout zero-contract audit — ' + result.url,
      ...(result.summary.reviewCoverage ? ['  Opt-in review coverage: '+result.summary.reviewCoverage.status+
        '; '+result.summary.reviewCoverage.totalOmissions+' candidate observations omitted across '+
        result.summary.reviewCoverage.viewportsWithOmissions+' viewport(s); not a clean-page verdict'] : []),
      ...(a.actions ? ['  Setup: '+actions.length+' validated declarative action(s), replayed at each width; values omitted'] : []),
      ...result.reports.flatMap(report => [
        report.viewport.width + 'px (' + report.viewport.direction + '): ' +
          report.summary.errors + ' measured issues, ' + report.summary.warnings +
          ' review warnings; ' + report.coverage.visitedElements + ' DOM elements traversed' +
          (report.coverage.status === 'truncated' ? ' (TRUNCATED)' :
            report.coverage.status === 'known-uninspected-content' ? ' (PARTIAL COVERAGE)' : '') +
          (((a['grid-gap-review'] && (report.coverage.gridContainersOmitted ?? 0) > 0) ||
            (a['sibling-overlap-review'] && (report.coverage.overlapContainersOmitted ?? 0) > 0))
            ? ' (REVIEW CANDIDATES OMITTED)' : ''),
        ...(report.fullPageScreenshot ? ['  Bounded page evidence: '+report.fullPageScreenshot.capturedWidth+'×'+report.fullPageScreenshot.capturedHeight+' CSS px ('+report.fullPageScreenshot.coverage+')'] : []),
        ...(report.frameInventory ? ['  Frame inventory: '+report.frameInventory.observedFrameDocuments+' / '+report.frameInventory.frameCount+' declared frame documents observed by DOMSnapshot ('+report.frameInventory.status+', '+report.frameInventory.unresolvedDomFrames+' DOM frames unresolved); no inner-frame layout checks'] : []),
        ...report.findings.map(finding =>
          '  ' + finding.severity.toUpperCase() + ' ' + finding.code + ': ' + finding.message +
            (finding.path ? ' [' + finding.path + ']' : ''))
      ]),
      'Total: ' + result.summary.measuredIssues + ' measured issues, ' +
        result.summary.reviewWarnings + ' review warnings, ' +
        result.summary.incompleteViewports + ' incomplete viewport(s)',
      'Caution: measured facts do not establish whether overflow/truncation was intentional.'
    ].join('\n');
    await output(a, payload, printable);
    if (result.summary.incompleteViewports) process.exitCode = 2;
    else if (a['fail-on-coverage-gaps'] && result.summary.partialViewports) process.exitCode = 2;
    else if (result.summary.measuredIssues) process.exitCode = 1;
  }

  return audit;
}
