import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const cwd = path.resolve(import.meta.dirname, '..');
const cli = path.join(cwd, 'bin/bronto-layout.mjs');
const run = args => spawnSync(process.execPath, [cli, ...args], {
  cwd, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024,
  env: { ...process.env, BRONTO_TEST_INLINE_FIXTURE: '1', BRONTO_CHROME_NO_SANDBOX: '1' }
});
function skipMissingChrome(t, result) {
  if (result.status !== 2) return false;
  const message = result.stdout + result.stderr;
  if (!/Cannot find Chrome\/Chromium/.test(message)) return false;
  if (process.env.BRONTO_REQUIRE_CHROME === '1') throw new Error('Chromium required by CI');
  t.skip('Chromium not available'); return true;
}
test('CLI batch reports independent passes and layout violations with aggregate exit 1', t => {
  const result = run(['batch', '--manifest', 'examples/batch.json', '--json', '--compact']);
  if (skipMissingChrome(t, result)) return;
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const data = JSON.parse(result.stdout);
  assert.equal(data.mode, 'batch');
  assert.equal(data.format, 'compact');
  assert.equal(data.summary.total, 2);
  assert.equal(data.summary.passed, 1);
  assert.equal(data.summary.violations, 1);
  assert.equal(data.summary.errors, 0);
  assert.equal(data.jobs[0].id, 'healthy-gallery');
  assert.equal(data.jobs[0].status, 'pass');
  assert.equal(data.jobs[1].id, 'broken-gallery');
  assert.equal(data.jobs[1].status, 'violations');
  assert.ok(data.jobs[1].result.failures.length > 0);
  assert.deepEqual(data.jobs[1].result.sampledWidths, [375]);
});
test('CLI batch continues after a job fails to load but preserves exit 2', t => {
  const result = run(['batch', '--manifest', 'examples/batch-error.json', '--json', '--compact']);
  if (skipMissingChrome(t, result)) return;
  assert.equal(result.status, 2, result.stderr || result.stdout);
  const data = JSON.parse(result.stdout);
  assert.equal(data.mode, 'batch');
  assert.equal(data.summary.total, 2);
  assert.equal(data.summary.passed, 1);
  assert.equal(data.summary.errors, 1);
  assert.equal(data.jobs[1].status, 'error');
  assert.equal(data.jobs[1].exitCode, 2);
  assert.match(data.jobs[1].result.error.message, /does not exist|ENOENT/);
});
test('batch dry-run previews first-party routes and locales without launching Chrome', () => {
  const r = run(['batch', '--manifest', 'examples/live-sites-batch.json', '--dry-run', '--json']);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const data = JSON.parse(r.stdout);
  assert.equal(data.mode, 'batch-plan');
  assert.equal(data.total, 6);
  assert.ok(data.jobs.every(job => job.spec.endsWith('.json')));
  assert.equal(data.jobs.find(job => job.id === 'brontoui-home').target,
    'https://ponchia.github.io/bronto-ui/');
  assert.equal(data.jobs.find(job => job.id === 'brontoui-operations').target,
    'https://ponchia.github.io/bronto-ui/examples/operations/');
  const arabic = data.jobs.find(job => job.id === 'sense6-arabic');
  assert.equal(arabic.locale, 'ar');
  assert.equal(arabic.target, 'https://sense6.net/ar/');
});
test('batch forwards per-job dark and reduced-motion preferences to Chromium', t => {
  const r = run(['batch', '--manifest', 'examples/batch-media.json', '--json', '--compact']);
  if (skipMissingChrome(t, r)) return;
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const data = JSON.parse(r.stdout);
  assert.equal(data.summary.passed, 1);
  assert.equal(data.summary.errors, 0);
  assert.equal(data.jobs[0].result.summary.failed, 0);
  assert.deepEqual(data.jobs[0].result.sampledWidths, [375]);
});
test('invalid manifests fail before launching any batch browser jobs', () => {
  const r = run(['batch', '--manifest', 'examples/batch.json', '--spec', 'examples/layout.json', '--json']);
  assert.equal(r.status, 2);
  const error = JSON.parse(r.stdout);
  assert.equal(error.mode, 'error');
  assert.match(error.error.message, /omit --spec/);
});

test('opt-in parallel batch preserves manifest ordering, isolated results, and failure exit codes', t => {
 const r=run(['batch','--manifest','examples/batch.json','--parallel','2','--json','--compact']);
 if (skipMissingChrome(t,r)) return;
 assert.equal(r.status,1,r.stderr||r.stdout);
 const payload=JSON.parse(r.stdout);
 assert.equal(payload.parallel,2);
 assert.deepEqual(payload.jobs.map(j=>j.id),['healthy-gallery','broken-gallery']);
 assert.deepEqual(payload.jobs.map(j=>j.status),['pass','violations']);
 assert.equal(payload.summary.errors,0);
});
test('batch refuses excessive concurrency before starting a child browser', () => {
 const r=run(['batch','--manifest','examples/batch.json','--parallel','99','--json']);
 assert.equal(r.status,2);
 assert.match(JSON.parse(r.stdout).error.message,/parallel/);
});
