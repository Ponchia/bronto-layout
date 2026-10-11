import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const cwd = path.resolve(import.meta.dirname, '..');
const cli = path.join(cwd, 'bin/bronto-layout.mjs');
const run = args => spawnSync(process.execPath, [cli, ...args], {
  cwd, encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024,
  env: { ...process.env, BRONTO_CHROME_NO_SANDBOX: '1', BRONTO_TEST_INLINE_FIXTURE: '1' }
});
function missing(t, result) {
  if (result.error?.code === 'ENOENT' || /Cannot find Chrome\/Chromium/.test(result.stdout + result.stderr)) {
    if (process.env.BRONTO_REQUIRE_CHROME === '1') throw new Error('Chromium required for CI');
    t.skip('Chromium unavailable'); return true;
  }
  return false;
}
test('CLI waits for delayed component resize before checking contract',t=>{
  const r=run(['check','--spec','examples/geometry-stable.json','--json','--compact',
    '--stable-for','850','--timeout','5000']);
  if(missing(t,r))return;
  assert.equal(r.status,0,r.stderr || r.stdout);
  const result=JSON.parse(r.stdout);
  assert.equal(result.summary.passed,1);
  assert.equal(result.summary.failed,0);
  assert.deepEqual(result.sampledWidths,[375]);
  assert.equal(result.stabilization.length,1);
  const evidence=result.stabilization[0];
  assert.equal(evidence.status,'stable');
  assert.equal(evidence.stableForMs,850);
  assert.ok(evidence.waitedMs >= 850);
  assert.ok(evidence.samples >= 4);
  assert.equal(evidence.epsilonPx,0.5);
});
test('CLI inspect reports exact final geometry and sampled quiet window',t=>{
  const r=run(['inspect','--url','examples/geometry-delayed.html',
    '--selector','card=#card','--width','375',
    '--stable-for','850','--timeout','5000','--json']);
  if(missing(t,r))return;
  assert.equal(r.status,0,r.stderr || r.stdout);
  const result=JSON.parse(r.stdout);
  assert.equal(result.snapshots[0].selectors.card[0].rect.width,160);
  assert.equal(result.snapshots[0].stabilization.status,'stable');
  assert.ok(result.snapshots[0].stabilization.samples>=4);
});
test('continuously changing bounding boxes never return a false stable report',t=>{
  const r=run(['inspect','--url','examples/geometry-moving.html',
    '--selector','card=#card','--width','375',
    '--stable-for','700','--timeout','2500','--json']);
  if(missing(t,r))return;
  assert.equal(r.status,2,r.stderr || r.stdout);
  const result=JSON.parse(r.stdout);
  assert.equal(result.mode,'error');
  assert.match(result.error.message,/did not stabilize/);
  assert.match(result.error.message,/items|card/);
});
test('a truncated 315-element collection cannot certify geometry stability',t=>{
  const r=run(['inspect','--url','examples/large-dom.html',
    '--selector','items=.item','--width','375',
    '--stable-for','300','--timeout','4500','--json']);
  if(missing(t,r))return;
  assert.equal(r.status,2,r.stderr || r.stdout);
  assert.match(JSON.parse(r.stdout).error.message,/more matches than measured elements: items/);
});
test('CLI compare waits for both revisions and returns no invented regression',t=>{
  const r=run(['compare','--spec','examples/geometry-stable.json',
    '--baseline','examples/geometry-healthy.html','--url','examples/geometry-delayed.html',
    '--stable-for','850','--timeout','5000','--json','--compact']);
  if(missing(t,r))return;
  assert.equal(r.status,0,r.stderr || r.stdout);
  const result=JSON.parse(r.stdout);
  assert.equal(result.summary.regressions,0);
  assert.equal(result.summary.candidateFailures,0);
  assert.equal(result.stabilization.baseline.length,1);
  assert.equal(result.stabilization.candidate.length,1);
});
test('batch jobs forward stableFor to independent CLI checks',t=>{
  const r=run(['batch','--manifest','examples/batch-geometry-stable.json',
    '--json','--compact','--timeout','5000']);
  if(missing(t,r))return;
  assert.equal(r.status,0,r.stderr || r.stdout);
  const result=JSON.parse(r.stdout);
  assert.equal(result.mode,'batch');
  assert.equal(result.summary.passed,1);
  assert.equal(result.jobs[0].result.stabilization[0].stableForMs,850);
});
test('invalid timeout and commands reject stability wait without launching browser',()=>{
  const invalid=run(['check','--spec','examples/geometry-stable.json',
    '--stable-for','500','--timeout','400','--json']);
  assert.equal(invalid.status,2);
  assert.match(JSON.parse(invalid.stdout).error.message,/shorter than --timeout/);
  const unrelated=run(['validate','--spec','examples/geometry-stable.json',
    '--stable-for','500','--json']);
  assert.equal(unrelated.status,2);
  assert.match(JSON.parse(unrelated.stdout).error.message,/only to inspect/);
});
