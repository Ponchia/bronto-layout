/** Isolated finite, declarative CLI batch runner.
 * The shared CLI owns individual checks, scenario validation and browsers;
 * each job runs via Node argv in its own process, never a shell command.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBatchManifest } from '../dist/batch.js';
import { parseContract } from '../dist/contract.js';
import { parseLayoutActions } from '../dist/actions.js';
import { int, configFromArgs, getWidths } from './cli-options.mjs';

const execFileAsync = promisify(execFile);
// Extracting from the original CLI must NOT change the subprocess entrypoint.
// Using import.meta.url unmodified here would spawn batch-command.mjs instead.
const cliPath = fileURLToPath(new URL('./bronto-layout.mjs', import.meta.url));

/** Pure dry-run path and bounded isolated child-process execution. */
export function createBatchCommand({ output }) {
  async function batch(a) {
    const parallel = int(a.parallel ?? '1', '--parallel', 1, 4);
    const manifestFile = path.resolve(a.manifest);
    const manifest = parseBatchManifest(JSON.parse(await readFile(manifestFile, 'utf8')));
    // Validate ALL referenced contracts and declarative action files before
    // launching a browser. A failed input must never allow half a suite to run.
    const baseDirectory = path.dirname(manifestFile);
    const targetURL = raw => /^https?:\/\//.test(raw) || /^file:\/\//.test(raw)
      ? raw : path.resolve(baseDirectory, raw);
    const jobs = await Promise.all(manifest.jobs.map(async job => {
      const mode = job.mode ?? 'check';
      if (mode === 'audit') {
        const actionsFile = job.actions ? path.resolve(baseDirectory, job.actions) : null;
        const actions = actionsFile
          ? parseLayoutActions(JSON.parse(await readFile(actionsFile, 'utf8'))) : [];
        return { ...job, mode, absoluteSpec: null, absoluteTarget: targetURL(job.url),
          contractURL: null, approvedScenario: {}, actionsFile, actionCount: actions.length };
      }
      const spec = path.resolve(baseDirectory, job.spec);
      const contract = parseContract(JSON.parse(await readFile(spec, 'utf8')));
      return { ...job, mode, absoluteSpec: spec, absoluteTarget: job.url ? targetURL(job.url) : null,
        contractURL: contract.url, approvedScenario: contract.scenario ?? {} };
    }));
    if (jobs.some(job => job.mode === 'audit') && a['stable-for'] !== undefined) {
      throw new Error('Batch audit cannot use --stable-for without named selectors; remove it from the batch');
    }
    if (jobs.some(job => job.mode === 'audit') && a['fail-on-skip']) {
      throw new Error('Batch audit has no contract skips; remove --fail-on-skip');
    }
    if (a['dry-run']) {
      const data = {
        schemaVersion: 1, mode: 'batch-plan', manifest: manifestFile,
        total: jobs.length, parallel,
        jobs: jobs.map(job => ({ id: job.id, mode: job.mode, spec: job.absoluteSpec,
          target: job.url ?? job.contractURL ?? null,
          ...(job.mode === 'audit' ? { stateSetup: {actionCount:job.actionCount},
            auditOptions:{gridGapReview:Boolean(job.gridGapReview),
              siblingOverlapReview:Boolean(job.siblingOverlapReview),
              frameInventory:Boolean(job.frameInventory),
              failOnCoverageGaps:Boolean(job.failOnCoverageGaps),
              domLimit:job.domLimit ?? 18000} } : {}),
          widths: job.widths ?? null, scan: job.scan ?? null,
          ...(job.mode === 'check' ? { refine: Boolean(job.refine),
            interiorProbes: job.interiorProbes ?? 0, failOnSkip: Boolean(job.failOnSkip ?? a['fail-on-skip']) } : {}),
          cssBreakpoints: Boolean(job.cssBreakpoints),
          locale: job.locale ?? a.locale ?? job.approvedScenario.locale ?? null,
          colorScheme: job.colorScheme ?? a['color-scheme'] ?? job.approvedScenario.colorScheme ?? null,
          reducedMotion: Boolean(job.reducedMotion ?? (a['normal-motion'] ? false : a['reduced-motion']) ?? job.approvedScenario.reducedMotion),
          mobile: Boolean(job.mobile ?? (a.desktop ? false : a.mobile) ?? job.approvedScenario.mobile),
          layoutShifts: Boolean(job.layoutShifts ?? a['layout-shifts']),
          stableFor: job.stableFor ?? a['stable-for'] ?? job.approvedScenario.stableFor ?? null,
          readySelector: a['ready-selector'] ?? job.approvedScenario.readySelector ?? null,
          height: a.height ?? job.approvedScenario.height ?? null }))
      };
      await output(a, data, 'Validated ' + jobs.length + ' batch jobs without opening Chromium');
      return;
    }
    const outcomes = new Array(jobs.length);
    async function runJob(job) {
      const argv = job.mode === 'audit'
        ? [cliPath, 'audit', '--url', job.absoluteTarget, '--json']
        : [cliPath, 'check', '--spec', job.absoluteSpec, '--json'];
      if (a.compact) argv.push('--compact');
      if (job.mode === 'check' && job.absoluteTarget) argv.push('--url', job.absoluteTarget);
      if (job.mode === 'audit') {
        if (job.actionsFile) argv.push('--actions', job.actionsFile);
        if (job.gridGapReview) argv.push('--grid-gap-review');
        if (job.siblingOverlapReview) argv.push('--sibling-overlap-review');
        if (job.frameInventory) argv.push('--frame-inventory');
        if (job.failOnCoverageGaps) argv.push('--fail-on-coverage-gaps');
        if (job.domLimit !== undefined) argv.push('--dom-limit', String(job.domLimit));
      }
      if (job.widths) argv.push('--widths', job.widths.join(','));
      if (job.scan) argv.push('--scan', job.scan);
      if (job.cssBreakpoints) argv.push('--css-breakpoints');
      if (job.layoutShifts ?? a['layout-shifts']) argv.push('--layout-shifts');
      const stableFor = job.stableFor ?? a['stable-for'];
      if (stableFor !== undefined) argv.push('--stable-for', String(stableFor));
      const locale = job.locale ?? a.locale;
      if (locale) argv.push('--locale', locale);
      const scheme = job.colorScheme ?? a['color-scheme'];
      if (scheme) argv.push('--color-scheme', scheme);
      if (job.reducedMotion === false) argv.push('--normal-motion');
      else if (job.reducedMotion ?? (a['reduced-motion'] && !a['normal-motion'])) argv.push('--reduced-motion');
      else if (a['normal-motion']) argv.push('--normal-motion');
      if (job.mobile === false) argv.push('--desktop');
      else if (job.mobile ?? (a.mobile && !a.desktop)) argv.push('--mobile');
      else if (a.desktop) argv.push('--desktop');
      for (const [option, value] of [['ready-selector', a['ready-selector']], ['height', a.height], ['timeout', a.timeout],
        ['settle', a.settle], ['chrome', a.chrome]]) {
        if (value !== undefined) argv.push('--' + option, value);
      }
      if (a['no-sandbox']) argv.push('--no-sandbox');
      if (job.mode === 'check') {
        if (job.refine) argv.push('--refine');
        if (job.interiorProbes !== undefined) argv.push('--interior-probes', String(job.interiorProbes));
        if (job.failOnSkip ?? a['fail-on-skip']) argv.push('--fail-on-skip');
      }
      if (a['evidence-dir']) argv.push('--evidence-dir', path.join(a['evidence-dir'], job.id));
      // Run each check with Node argv, never a shell or a manifest-provided command.
      const runtime = configFromArgs(a);
      const sampleCount = job.scan ? getWidths({ scan: job.scan }).length + 24 : (job.widths?.length ?? 4);
      const timeout = Math.min(600000, Math.max(90000, runtime.timeout * (sampleCount + 3)));
      // Each job gets its own isolated Chromium profile; no cookies or JS state
      // leak between concurrently executed sites. Child argv is never a shell.
      let child;
      try {
        const result = await execFileAsync(process.execPath, argv, {
          cwd: process.cwd(), encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024, env: process.env
        });
        child = { status: 0, stdout: result.stdout, stderr: result.stderr };
      } catch (error) {
        child = { status: typeof error.code === 'number' ? error.code : 2,
          stdout: error.stdout ?? '', stderr: error.stderr ?? '', error };
      }
      let report;
      try { report = JSON.parse(child.stdout); } catch { report = null; }
      const exitCode = (child.status === 0 || child.status === 1) && report?.mode === job.mode
        ? child.status : 2;
      const status = exitCode === 2 ? 'error' : exitCode === 1 ?
        job.mode === 'audit' ? 'measured-issues' : 'violations' : 'pass';
      return {
        id: job.id, mode: job.mode, status, exitCode,
        ...(report ? { result: report } : {
          result: { schemaVersion: 1, mode: 'error', status: 'error', exitCode: 2,
            error: { code: 'BATCH_JOB_ERROR', message: child.error?.message || child.stderr?.trim() ||
              'Job exited without a readable JSON report' } }
        })
      };
    }
    // A bounded worker pool preserves manifest order while enabling explicit
    // parallelism on machines with enough CPU/memory. Default remains serial.
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(parallel, jobs.length) }, async () => {
      for (;;) {
        const index = next++;
        if (index >= jobs.length) break;
        outcomes[index] = await runJob(jobs[index]);
      }
    }));
    const summaryData = {
      total: outcomes.length,
      passed: outcomes.filter(j => j.status === 'pass').length,
      violations: outcomes.filter(j => j.status === 'violations').length,
      auditJobsWithIssues: outcomes.filter(j => j.status === 'measured-issues').length,
      errors: outcomes.filter(j => j.status === 'error').length,
      checksPassed: outcomes.reduce((n, j) => n + (j.result?.summary?.passed ?? 0), 0),
      checksFailed: outcomes.reduce((n, j) => n + (j.result?.summary?.failed ?? 0), 0),
      /** Audit findings are not contract assertions, so never mix their counts. */
      auditMeasuredIssues: outcomes.reduce((n,j) => n + (j.mode === 'audit' ?
        j.result?.summary?.measuredIssues ?? 0 : 0),0),
      auditReviewWarnings: outcomes.reduce((n,j) => n + (j.mode === 'audit' ?
        j.result?.summary?.reviewWarnings ?? 0 : 0),0),
      auditIncompleteViewports: outcomes.reduce((n,j) => n + (j.mode === 'audit' ?
        (j.result?.summary?.incompleteViewports ?? 0) : 0),0)
    };
    const result = { schemaVersion: 1, mode: 'batch', manifest: manifestFile, parallel,
      ...(a.compact ? { format: 'compact' } : {}), summary: summaryData, jobs: outcomes };
    const printable = [
      'Bronto Layout batch — ' + manifestFile,
      ...outcomes.map(j => '  ' + j.id + ' [' + j.mode + ']: ' + j.status.toUpperCase() +
        ' (exit ' + j.exitCode + ', ' + (j.mode === 'audit'
          ? (j.result?.summary?.measuredIssues ?? 0) + ' measured issue(s), ' +
            (j.result?.summary?.reviewWarnings ?? 0) + ' review warning(s)'
          : (j.result?.summary?.failed ?? 0) + ' failed checks') + ')'),
      'Total: ' + summaryData.passed + ' passed, ' + summaryData.violations +
        ' with approved-contract violations, ' + summaryData.auditJobsWithIssues +
        ' audit jobs with measured issues, ' + summaryData.errors + ' errors'
    ].join('\n');
    await output(a, result, printable);
    if (summaryData.errors) process.exitCode = 2;
    else if (summaryData.violations || summaryData.auditJobsWithIssues) process.exitCode = 1;
  }

  return batch;
}
