import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeLayoutShifts } from '../dist/layout-shifts.js';
import { parseContract } from '../dist/contract.js';
import { evaluateLayout } from '../dist/core.js';
import { compareReports } from '../dist/compare.js';

const observation = events => ({
  supported: true, observedEvents: events.length, droppedEvents: 0, events
});
const event = (time, value, hadRecentInput=false) => ({
  startTime: time, value, hadRecentInput, sources: []
});
const snapshot = shifts => ({
  viewport: { width: 375, height: 900, direction: 'ltr' },
  document: { width: 375, height: 900 },
  selectors: {}, layoutShifts: shifts
});

test('CLS-like maximum session window excludes shifts after recent user input', () => {
  const result = summarizeLayoutShifts(observation([
    event(100, 0.03), event(650, 0.04), event(2000, 0.1, true),
    event(2700, 0.02), event(8500, 0.05)
  ]));
  assert.equal(result.supported, true);
  assert.equal(result.shiftCount, 4);
  assert.equal(result.ignoredInputCount, 1);
  assert.equal(result.maxSessionScore, 0.07);
  assert.equal(result.totalScore, 0.14);
});
test('session maximum resets at five seconds even without a one-second gap', () => {
  const result = summarizeLayoutShifts(observation([
    event(0,0.02), event(900,0.02), event(1800,0.02),
    event(2700,0.02), event(3600,0.02), event(4500,0.02),
    event(5400,0.04)
  ]));
  assert.equal(result.maxSessionScore, 0.12);
  assert.equal(result.totalScore, 0.16);
});
test('truncated or unsupported shift observations cannot count as verified stable', () => {
  assert.equal(summarizeLayoutShifts(undefined).supported,false);
  const result = summarizeLayoutShifts({ ...observation([event(20,.01)]), droppedEvents: 2 });
  assert.equal(result.supported,false);
  assert.match(result.reason,/incomplete/);
  assert.equal(evaluateLayout(snapshot(result), [{ id:'stability', type:'layout-stability', maxScore:0.1 }]).findings[0].status,'skip');
});
test('contracts explicitly accept finite layout-stability budgets', () => {
  const contract={ selectors:{}, rules:[{id:'stability',type:'layout-stability',maxScore:.03}] };
  assert.equal(parseContract(contract).rules[0].maxScore,.03);
  assert.throws(()=>parseContract({ ...contract,rules:[{id:'stability',type:'layout-stability'}]}),/maxScore/);
  assert.throws(()=>parseContract({ ...contract,rules:[{id:'stability',type:'layout-stability',maxScore:-1}]}),/maxScore/);
  assert.throws(()=>parseContract({ ...contract,rules:[{id:'stability',type:'layout-stability',maxScore:.1,notAField:true}]}),/unknown field/);
});
test('stability contracts fail deterministically above the declared score', () => {
  const rules=[{id:'stable',type:'layout-stability',maxScore:.01}];
  const clean=evaluateLayout(snapshot(summarizeLayoutShifts(observation([]))),rules);
  const moving=evaluateLayout(snapshot(summarizeLayoutShifts(observation([event(100,.08)]))),rules);
  assert.equal(clean.findings[0].status,'pass');
  assert.equal(moving.findings[0].status,'fail');
  assert.equal(moving.findings[0].deviation,.07);
  const compare=compareReports('https://stable.test/','https://moving.test/',[clean],[moving]);
  assert.equal(compare.summary.regressions,1);
  assert.equal(compare.changes[0].errorUnit,'score');
});

test('a batch manifest can request layout-shift observations per job', async () => {
  const { parseBatchManifest } = await import('../dist/batch.js');
  const valid = parseBatchManifest({
    schemaVersion: 1, jobs: [
      { id: 'stability', spec: 'stability.json', layoutShifts: true }
    ]
  });
  assert.equal(valid.jobs[0].layoutShifts, true);
  assert.throws(() => parseBatchManifest({
    schemaVersion: 1, jobs: [
      { id: 'stability', spec: 'stability.json', layoutShifts: 'true' }
    ]
  }), /boolean/);
});

test('worsening already-failing shift scores remain regressions, not unchanged px errors', () => {
  const rule = { id: 'stable', type: 'layout-stability', maxScore: .005 };
  const earlier = evaluateLayout(snapshot(summarizeLayoutShifts(observation([event(100,.04)]))), [rule]);
  const later = evaluateLayout(snapshot(summarizeLayoutShifts(observation([event(100,.08)]))), [rule]);
  const comparison = compareReports('https://one.test/', 'https://two.test/', [earlier], [later]);
  assert.equal(comparison.summary.regressions, 1);
  assert.equal(comparison.changes[0].errorUnit, 'score');
  assert.equal(comparison.changes[0].kind, 'regression');
});
