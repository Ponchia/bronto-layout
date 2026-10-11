import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestLayoutContracts, acceptContractProposals } from '../dist/contract-discovery.js';
import { evaluateLayout } from '../dist/core.js';
function snapshot(width, overflow = 0) {
  const gutter = width > 500 ? 40 : 12;
  const shell = { x: gutter, y: 0, width: width - 2 * gutter, height: 300 };
  const el = (path, rect) => ({ path, tag: 'div', rect });
  const tiles = Array.from({ length: 6 }, (_, i) => {
    const columns = width < 500 ? 1 : 3;
    const x = gutter + (i % columns) * 116;
    const y = 85 + Math.floor(i / columns) * 100;
    return el('#tile-' + i, { x, y, width: 100, height: 75 });
  });
  return { viewport: { width, height: 900, direction: 'ltr' },
    document: { width: width + overflow, height: 1200 },
    selectors: { shell: [el('#shell', shell)], gallery: [el('#gallery',
      { ...shell, y: 60, height: 550 })], tiles },
    selectorCounts: { shell: 1, gallery: 1, tiles: 6 } };
}
const selectors = { shell: '#shell', gallery: '#gallery', tiles: '.tile' };
test('proposals separate factual measurements from human design approval', () => {
  const widths = [375, 768, 1280];
  const draft = suggestLayoutContracts('https://example.test/', selectors,
    widths.map(w => snapshot(w)), ['tiles']);
  assert.deepEqual(draft.widths, widths);
  assert.ok(draft.proposals.every(p => p.reviewRequired && p.deviations.length > 0));
  assert.ok(draft.proposals.some(p => p.id === 'document-horizontal-fit'));
  const gaps = draft.proposals.find(p => p.id === 'uniform-x-tiles');
  assert.ok(gaps, JSON.stringify(draft.proposals.map(p => p.id)));
  assert.equal(gaps.rule.minWidth, 768);
  assert.equal(gaps.rule.maxWidth, 1280);
  assert.deepEqual(gaps.sampledWidths, [768, 1280]);
  const approved = acceptContractProposals(draft, ['uniform-x-tiles']);
  assert.equal(approved.rules.length, 1);
  assert.deepEqual(Object.keys(approved.selectors), ['tiles']);
  assert.equal(approved.rules[0].type, 'uniform-gaps');
  assert.equal(evaluateLayout(snapshot(768), approved.rules).summary.failed, 0);
  assert.equal(evaluateLayout(snapshot(375), approved.rules).findings[0].status, 'skip');
});
test('already broken layout never yields a passing document-fit proposal', () => {
  const draft = suggestLayoutContracts('https://example.test/', selectors,
    [375, 768].map(w => snapshot(w, 50)), ['tiles']);
  assert.ok(!draft.proposals.some(p => p.id === 'document-horizontal-fit'));
});
test('approval is explicit and rejects unknown, duplicate and invalid proposals', () => {
  const draft = suggestLayoutContracts('https://example.test/', selectors,
    [snapshot(375), snapshot(1280)]);
  assert.throws(() => acceptContractProposals(draft, []), /Provide distinct/);
  assert.throws(() => acceptContractProposals(draft, ['made-up-rule']), /Unknown proposal/);
  assert.throws(() => acceptContractProposals(draft, ['document-horizontal-fit','document-horizontal-fit']), /Provide distinct/);
  assert.throws(() => acceptContractProposals({}, ['document-horizontal-fit']), /Invalid proposal draft/);
  assert.equal(acceptContractProposals(draft, ['document-horizontal-fit']).rules.length, 1);
});
