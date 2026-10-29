import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateHostLayout } from '../dist/host.js';

const contract = {
  schemaVersion: 1,
  targets: { group: 'group', first: 'node-a', second: 'node-b', cards: ['node-a', 'node-b'] },
  rules: [
    { id: 'inside', type: 'contained', element: 'first', in: 'group', tolerance: 0 },
    { id: 'edge', type: 'align-edge', a: 'first', b: 'second', edgeA: 'top', tolerance: 1 },
    { id: 'two-cards', type: 'selector-count', element: 'cards', exactly: 2 },
  ],
};
function fixture() {
  return {
    space: 'world', inventoryComplete: true, revision: 'rev1',
    root: { x: 1000, y: 2000, width: 500, height: 400 },
    viewport: { width: 390, height: 844, direction: 'ltr' },
    elements: [
      { id: 'group', space: 'world', measurement: 'measured', rect: { x: 1020, y: 2020, width: 300, height: 200 } },
      { id: 'node-a', space: 'world', measurement: 'measured', rect: { x: 1040, y: 2050, width: 80, height: 50 } },
      { id: 'node-b', space: 'world', measurement: 'measured', rect: { x: 1140, y: 2050, width: 80, height: 50 } },
    ],
  };
}
test('approved relationships evaluate world coordinates with a nonzero root and stable IDs', () => {
  const report = evaluateHostLayout(fixture(), contract);
  assert.equal(report.assessment, 'pass');
  assert.deepEqual(report.summary, { passed: 3, failed: 0, skipped: 0 });
  assert.deepEqual(report.coverage, { targets: 5, measured: 5, unavailable: 0, missing: 0 });
  assert.equal(report.revision, 'rev1');
  assert.equal(report.space, 'world');
});
test('an intentional 12px misalignment fails with node paths', () => {
  const snapshot = fixture();
  snapshot.elements[2].rect.y += 12;
  const report = evaluateHostLayout(snapshot, contract);
  assert.equal(report.assessment, 'fail');
  assert.equal(report.findings.find(f => f.id === 'edge').deviation, 12);
  assert.deepEqual(report.findings.find(f => f.id === 'edge').paths,
    ['host://world/node-a', 'host://world/node-b']);
});
test('unmeasured elements and absence never become a passing relation', () => {
  const snapshot = fixture();
  snapshot.elements[2] = { id: 'node-b', space: 'world', measurement: 'unavailable' };
  const result = evaluateHostLayout(snapshot, contract);
  assert.equal(result.assessment, 'unverified');
  assert.equal(result.findings.find(f => f.id === 'edge').code, 'measurement-unavailable');
  assert.deepEqual(result.coverage, { targets: 5, measured: 3, unavailable: 2, missing: 0 });
  snapshot.elements.splice(2, 1);
  const missing = evaluateHostLayout(snapshot, contract);
  assert.equal(missing.assessment, 'fail');
  assert.equal(missing.findings.find(f => f.id === 'edge').code, 'missing-selector');
});
test('world and screen geometry cannot silently mix', () => {
  const snapshot = fixture();
  snapshot.elements[1].space = 'screen';
  assert.throws(() => evaluateHostLayout(snapshot, contract), /mixed coordinate spaces/);
});
test('reject stale/incomplete inventory, invalid rectangles, duplicate IDs and uninspectable rule types', () => {
  const snapshot = fixture();
  snapshot.inventoryComplete = false;
  assert.throws(() => evaluateHostLayout(snapshot, contract), /incomplete/);
  snapshot.inventoryComplete = true;
  snapshot.elements[0].rect.width = Infinity;
  assert.throws(() => evaluateHostLayout(snapshot, contract), /invalid or unsupported/);
  snapshot.elements[0].rect.width = 300;
  snapshot.elements.push(snapshot.elements[0]);
  assert.throws(() => evaluateHostLayout(snapshot, contract), /unique and nonempty/);
  snapshot.elements.pop();
  assert.throws(() => evaluateHostLayout(snapshot, { targets: { a: 'node-a' },
    rules: [{ id: 'clipped', type: 'no-clipping', element: 'a' }] }), /cannot verify no-clipping/);
});
test('root containment and responsive ranges use host units and CSS viewport widths separately', () => {
  const report = evaluateHostLayout(fixture(), {
    targets: { first: 'node-a' },
    rules: [
      { id: 'on-root', type: 'contained', element: 'first', in: 'viewport', tolerance: 0 },
      { id: 'desktop', type: 'size-range', element: 'first', axis: 'width', minWidth: 1000, min: 20 },
    ],
  });
  assert.equal(report.assessment, 'pass');
  assert.equal(report.findings[1].code, 'outside-width-range');
  assert.equal(report.summary.passed, 1);
});
test('an all-unavailable or all-outside-width result is unverified', () => {
  const snapshot = fixture();
  snapshot.elements[1] = { id: 'node-a', space: 'world', measurement: 'unavailable' };
  const input = { targets: { a: 'node-a' }, rules: [
    { id: 'size', type: 'size-range', element: 'a', axis: 'width', min: 30 },
  ] };
  assert.equal(evaluateHostLayout(snapshot, input).assessment, 'unverified');
  input.rules[0].minWidth = 800;
  assert.equal(evaluateHostLayout(snapshot, input).assessment, 'unverified');
});
