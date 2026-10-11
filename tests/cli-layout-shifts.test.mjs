import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const cwd = path.resolve(import.meta.dirname, '..');
const cli = path.join(cwd, 'bin/bronto-layout.mjs');
function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd, encoding: 'utf8', timeout: 90000, maxBuffer: 12 * 1024 * 1024,
    env: {
      ...process.env,
      BRONTO_TEST_INLINE_FIXTURE: '1',
      BRONTO_CHROME_NO_SANDBOX: '1'
    }
  });
}
function skipIfNoChrome(t, r) {
  if (r.error?.code === 'ENOENT' || /Cannot find Chrome\/Chromium/.test(r.stdout + r.stderr)) {
    if (process.env.BRONTO_REQUIRE_CHROME === '1') throw new Error('Chromium required by CI');
    t.skip('Chromium not installed'); return true;
  }
  return false;
}
const options = ['--settle', '750', '--width', '375'];

test('inspector observes the delayed shift and its affected element', t => {
  const r = run(['inspect', '--url', 'examples/layout-shifts-unstable.html',
    '--selector', 'content=#below', ...options, '--layout-shifts', '--json']);
  if (skipIfNoChrome(t,r)) return;
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const snapshot = JSON.parse(r.stdout).snapshots[0];
  const shifts = snapshot.layoutShifts;
  assert.equal(shifts.supported, true);
  assert.ok(shifts.maxSessionScore > 0.02, JSON.stringify(shifts));
  assert.ok(shifts.shiftCount >= 1);
  assert.ok(shifts.events.some(event => event.sources.some(source =>
    source.locator === '#below' && source.currentRect.y > source.previousRect.y)));
});

test('layout-stability contract passes healthy page without explicit collector flag', t => {
  const r = run(['check', '--spec', 'examples/layout-shifts.json',
    ...options, '--json']);
  if (skipIfNoChrome(t,r)) return;
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const report = JSON.parse(r.stdout);
  assert.equal(report.summary.failed, 0);
  assert.equal(report.reports[0].layoutShifts.supported, true);
  assert.ok(report.reports[0].layoutShifts.maxSessionScore <= 0.005);
});

test('layout-stability contract fails shifted page with score and exact source evidence', t => {
  const r = run(['check', '--spec', 'examples/layout-shifts.json', '--url',
    'examples/layout-shifts-unstable.html', ...options, '--json', '--compact']);
  if (skipIfNoChrome(t,r)) return;
  assert.equal(r.status, 1, r.stderr || r.stdout);
  const result = JSON.parse(r.stdout);
  assert.equal(result.mode, 'check');
  assert.equal(result.format, 'compact');
  assert.equal(result.summary.failed, 1);
  assert.equal(result.failures[0].id, 'loading-is-stable');
  assert.deepEqual(result.sampledWidths, [375]);
  assert.ok(result.layoutShifts[0].maxSessionScore > 0.02);
  assert.ok(result.layoutShifts[0].topEvents[0].sources.some(source => source.locator === '#below'));
});

test('compare classifies a new loading shift as a verified score regression', t => {
  const r = run(['compare', '--spec', 'examples/layout-shifts.json',
    '--baseline', 'examples/layout-shifts-healthy.html',
    '--url', 'examples/layout-shifts-unstable.html', ...options,
    '--json', '--compact']);
  if (skipIfNoChrome(t,r)) return;
  assert.equal(r.status, 1, r.stderr || r.stdout);
  const result = JSON.parse(r.stdout);
  const change = result.changes.find(item => item.ruleId === 'loading-is-stable');
  assert.equal(change.kind, 'regression');
  assert.equal(change.errorUnit, 'score');
  assert.ok(result.layoutShifts.candidate[0].maxSessionScore >
    result.layoutShifts.baseline[0].maxSessionScore);
  assert.equal(result.summary.regressions, 1);
});

test('reject layout-shift instrumentation on commands without a browser check', () => {
  const r = run(['validate', '--spec', 'examples/layout-shifts.json',
    '--layout-shifts', '--json']);
  assert.equal(r.status, 2);
  assert.match(JSON.parse(r.stdout).error.message, /only to inspect/);
});
