#!/usr/bin/env node
/** Weekly/opt-in real-project baseline: no arbitrary sites, JS actions or reports uploaded. */
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { TARGETS, EXPECTED_WIDTHS, verifyTargetSpec, summarizeTarget, pulseSummary, pulseMarkdown } from './first-party-pulse-core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv.length === 2 ? '--plan' : process.argv.length === 3 ? process.argv[2] : null;
if (!['--plan','--run'].includes(arg)) {
  console.error('Usage: node scripts/first-party-pulse.mjs [--plan|--run]');
  process.exit(2);
}

// A public site's CSP does not replace the process isolation of Chromium.
if (process.env.BRONTO_CHROME_NO_SANDBOX === '1') {
  throw new Error('Public-site pulse refuses BRONTO_CHROME_NO_SANDBOX=1');
}

// Reject a newly added or accidentally edited remote before any navigation.
for (const target of TARGETS) {
  const source = JSON.parse(await readFile(join(root, 'examples', target.file), 'utf8'));
  verifyTargetSpec(target, source);
}
if (arg === '--plan') {
  console.log(JSON.stringify({mode:'plan', targetIds:TARGETS.map(t=>t.id),
    expectedWidths:EXPECTED_WIDTHS, upload:'sanitized metadata only', sandbox:'required'},null,2));
  process.exit(0);
}

const cli = join(root, 'bin/bronto-layout.mjs');
const allowedEnv = ["HOME","PATH","TMPDIR","LANG","LC_ALL","CHROME_PATH","XDG_RUNTIME_DIR"];
const env = Object.fromEntries(allowedEnv.filter(key => typeof process.env[key] === 'string')
  .map(key => [key, process.env[key]]));
env.BRONTO_CHROME_NO_SANDBOX = '0';
env.CI = 'true';
const rows = [];
for (const target of TARGETS) {
  const args = [cli, 'check', '--spec', join(root, 'examples', target.file),
    '--ready-selector', 'body', '--settle', '600', '--timeout', '30000',
    '--max-samples', '64', '--interior-probes', '1', '--fail-on-skip', '--json', '--compact'];
  if (target.locale) args.push('--locale', target.locale);
  const start = process.hrtime.bigint();
  const child = spawnSync(process.execPath, args, {
    cwd: root, env, shell: false, encoding: 'utf8', timeout: 120_000,
    maxBuffer: 5 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']
  });
  const elapsedMs = Math.max(0, Math.ceil(Number(process.hrtime.bigint() - start) / 1e6));
  let report;
  try {report = JSON.parse(child.stdout);} catch { /* malformed/absent is unverified */ }
  const exit = child.error || child.signal || child.status === null ? 2 : child.status;
  if (exit === 2 && !report && (child.error || child.signal)) report = {error:{code:'CLI_PROCESS_ERROR'}};
  const row = summarizeTarget(target, exit, report, elapsedMs);
  rows.push(row);
  console.log(`${target.id}: ${row.status}; ${row.checkedWidths} width(s), ${row.passed} pass, ${row.failed} fail, ${row.skipped} skip${row.code ? '; '+row.code : ''}`);
}
const aggregate = pulseSummary(rows);
const publicSummary = {
  ...aggregate,
  generatedAt: new Date().toISOString(),
  sourceRevision: typeof process.env.GITHUB_SHA === 'string' && /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA)
    ? process.env.GITHUB_SHA : null,
  // The cohort's configured initial URLs are in Git. We intentionally omit
  // browser-returned URLs, HTML, CSS, screenshots, matched selectors and text.
  evidencePolicy: 'sanitized-only; raw browser output discarded'
};
const summaryMarkdown = pulseMarkdown(publicSummary);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown);
if (process.env.RUNNER_TEMP) await writeFile(join(process.env.RUNNER_TEMP, 'bronto-first-party-pulse-summary.json'),
  JSON.stringify(publicSummary,null,2)+'\n', {mode:0o600});
console.log(summaryMarkdown);
if (aggregate.passing !== TARGETS.length) process.exitCode = 1;
