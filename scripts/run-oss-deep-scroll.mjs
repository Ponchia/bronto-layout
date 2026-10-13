#!/usr/bin/env node
/**
 * Fixed, anonymous third-party scroll-state research. Never generalize this
 * into an arbitrary URL, script injection or authenticated browsing service.
 * Chrome must be launched sandboxed on an ephemeral CI runner.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin/bronto-layout.mjs');
const cohort = JSON.parse(readFileSync(path.join(root, 'benchmarks/oss-scroll-states.v0.1.json'), 'utf8'));
const known = new Map([
  ['docusaurus', ['https://docusaurus.io/docs/', '#something-missing']],
  ['vite', ['https://vite.dev/guide/', '#command-line-interface']]
]);

export function fixedScrollPlan() {
  assert.equal(cohort.id, 'external-oss-deep-scroll-v0_1');
  assert.deepEqual(cohort.allowedHosts, ['docusaurus.io', 'vite.dev']);
  assert.equal(cohort.contracts.length, 2);
  const plan = [];
  for (const file of cohort.contracts) {
    assert.match(file, /^benchmarks\/oss-scroll\/[a-z-]+\.json$/);
    const id = path.basename(file, '.json');
    const expected = known.get(id);
    assert.ok(expected, 'Only reviewed external documentation routes are allowed: ' + id);
    const spec = JSON.parse(readFileSync(path.join(root, file), 'utf8'));
    assert.equal(spec.url, expected[0]);
    assert.deepEqual(spec.widths, [320, 1280]);
    assert.deepEqual(spec.actions, [
      { type: 'scroll-into-view', selector: expected[1] },
      { type: 'pause', milliseconds: 180 }
    ]);
    assert.equal(spec.selectors.target, expected[1]);
    assert.deepEqual(spec.rules.map(r => [r.id, r.type]), [
      ['deep-section-exists', 'selector-count'],
      ['deep-section-visible-in-viewport', 'contained'],
      ['main-document-exists', 'selector-count']
    ]);
    plan.push({ id, contractFile: file, ...spec });
  }
  assert.equal(new Set(plan.map(p => p.id)).size, 2);
  return plan;
}

function runCli(args) {
  const res = spawnSync(process.execPath, [cli, ...args, '--json'], {
    cwd: root, encoding: 'utf8', timeout: 70000, maxBuffer: 8 * 1024 * 1024,
    env: process.env
  });
  if (res.error) return { status: 2, output: '{}', error: res.error.message };
  return { status: res.status ?? 2, output: res.stdout ?? '{}', error: (res.stderr ?? '').slice(0, 1500) };
}
function writeJSON(filename, data) {
  writeFileSync(filename, JSON.stringify(data, null, 2) + '\n');
}
function collectFiles(dir, prefix = '') {
  const entries = [];
  for (const name of readdirSync(path.join(dir, prefix)).sort()) {
    if (name === 'SHA256SUMS') continue;
    const relative = path.posix.join(prefix.replaceAll(path.sep, '/'), name);
    const target = path.join(dir, relative);
    const metadata = lstatSync(target);
    assert.ok(!metadata.isSymbolicLink(), 'No symbolic links allowed in export evidence: ' + relative);
    if (metadata.isDirectory()) entries.push(...collectFiles(dir, relative));
    else {
      assert.ok(metadata.isFile(), 'Only regular files permitted in export evidence');
      entries.push(relative);
    }
  }
  return entries;
}
export function writeChecksums(dir) {
  const files = collectFiles(dir);
  assert.ok(files.length >= 7, 'Missing browser evidence files');
  const records = files.map(file => {
    const bytes = readFileSync(path.join(dir, file));
    return createHash('sha256').update(bytes).digest('hex') + '  ./' + file;
  });
  writeFileSync(path.join(dir, 'SHA256SUMS'), records.join('\n') + '\n');
  for (const file of files) assert.equal(
    createHash('sha256').update(readFileSync(path.join(dir, file))).digest('hex'),
    records.find(x => x.endsWith('  ./' + file)).slice(0, 64)
  );
  return files.length;
}

export function validateBrowserResult(spec, width, checked, audited) {
  if (checked.status !== 0 || audited.status > 1)
    throw new Error('CLI check exit=' + checked.status + ' / audit exit=' + audited.status +
      '; ' + checked.error + '; ' + audited.error);
  const result = JSON.parse(checked.output);
  const audit = JSON.parse(audited.output);
  const item = result.reports?.find(r => r.viewport?.width === width);
  const view = audit.reports?.[0];
  if (!item || !view || view.width !== width) throw new Error('Missing expected viewport report');
  const actual = new URL(audit.browser?.actualUrl || '');
  const expected = new URL(spec.url);
  if (actual.origin !== expected.origin || actual.pathname !== expected.pathname)
    throw new Error('Browser was redirected outside the fixed public documentation path');
  if (item.summary?.failed !== 0 || item.summary?.skipped !== 0 ||
      !item.findings?.some(f => f.id === 'deep-section-visible-in-viewport' && f.status === 'pass'))
    throw new Error('Deep section was not visibly reached by the approved contract');
  if (!Number.isFinite(item.viewport.scrollY) || !Number.isFinite(view.scrollY) ||
      item.viewport.scrollY <= 1000 || view.scrollY <= 1000)
    throw new Error('Capture did not establish a meaningful >1000 CSS px document scroll');
  if (view.summary?.supportedScopeMeasured !== true)
    throw new Error('Browser did not completely traverse its supported top-level scope');
  return {
    width, checkScrollY: item.viewport.scrollY, auditScrollY: view.scrollY,
    coverageStatus: view.coverage?.status, auditExitCode: audited.status,
    reviewCodes: view.findings?.map(f => ({ code: f.code, classification: f.classification })) ?? []
  };
}

export function main(args = process.argv.slice(2)) {
  const plan = fixedScrollPlan();
  if (args.length === 1 && args[0] === '--plan') {
    process.stdout.write(JSON.stringify(plan.map(p => ({
      id: p.id, url: p.url, widths: p.widths, target: p.selectors.target
    })), null, 2) + '\n');
    return;
  }
  if (args.length !== 2 || args[0] !== '--out' ||
      !args[1].startsWith('reports/oss-deep-scroll-')) {
    throw new Error('Usage: node scripts/run-oss-deep-scroll.mjs --plan | --out reports/oss-deep-scroll-RUN_ID');
  }
  const out = path.resolve(root, args[1]);
  if (!out.startsWith(path.join(root, 'reports') + path.sep)) throw new Error('Evidence output must remain within ignored reports/');
  mkdirSync(out, { recursive: true });
  const results = [];
  for (const spec of plan) {
    const dir = path.join(out, spec.id);
    mkdirSync(dir, { recursive: true });
    const actionsFile = path.join(dir, 'actions.json');
    writeJSON(actionsFile, spec.actions);
    const checked = runCli(['check', '--spec', spec.contractFile, '--settle', '750', '--timeout', '30000']);
    writeFileSync(path.join(dir, 'check.json'), checked.output);
    for (const width of spec.widths) {
      const screenDir = path.join(dir, 'screens-' + width);
      mkdirSync(screenDir, { recursive: true });
      const audited = runCli(['audit', '--url', spec.url, '--width', String(width),
        '--actions', actionsFile, '--settle', '750', '--timeout', '30000',
        '--compact', '--evidence-dir', screenDir]);
      writeFileSync(path.join(dir, 'audit-' + width + '.json'), audited.output);
      let record;
      try {
        record = { site: spec.id, ...validateBrowserResult(spec, width, checked, audited), status: 'verified' };
      } catch (e) {
        record = { site: spec.id, width, status: 'unverified', reason: String(e).slice(0, 600),
          checkExitCode: checked.status, auditExitCode: audited.status };
      }
      results.push(record);
      process.stdout.write(JSON.stringify(record) + '\n');
    }
  }
  writeJSON(path.join(out, 'results.json'), {
    datasetId: cohort.id, cases: results, complete: results.filter(x => x.status === 'verified').length
  });
  const hashed = writeChecksums(out);
  process.stdout.write('Evidence hashed: ' + hashed + ' files with artifact-relative SHA256SUMS paths\n');
  if (results.some(x => x.status !== 'verified')) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
