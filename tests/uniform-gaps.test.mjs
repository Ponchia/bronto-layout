import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { evaluateLayout } from '../dist/core.js';
import { parseContract } from '../dist/contract.js';

const root = path.resolve(import.meta.dirname, '..');
const elem = (id, x, y) => ({ path: '#' + id, tag: 'div', rect: { x, y, width: 100, height: 80 } });
const snapshot = elements => ({
  viewport: { width: 1200, height: 800, direction: 'ltr' },
  document: { width: 1200, height: 800 },
  selectors: { cards: elements }, selectorCounts: { cards: elements.length }
});
const rule = { id: 'gaps', type: 'uniform-gaps', element: 'cards', axis: 'x', laneTolerance: 2, tolerance: 1 };
const run = args => spawnSync(process.execPath, [path.join(root, 'bin/bronto-layout.mjs'), ...args], {
  cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 4e6,
  env: { ...process.env, BRONTO_TEST_INLINE_FIXTURE: '1', BRONTO_CHROME_NO_SANDBOX: '1' }
});

test('repeatable gallery gaps across multiple rows are measured without named cards', () => {
  const good = [elem('a', 10, 10), elem('b', 126, 10), elem('c', 242, 10),
    elem('d', 10, 114), elem('e', 126, 114), elem('f', 242, 114)];
  const initial = JSON.stringify(good);
  assert.equal(evaluateLayout(snapshot(good), [rule]).findings[0].status, 'pass');
  assert.equal(JSON.stringify(good), initial);
  const bad = good.map(e => ({ ...e, rect: { ...e.rect } }));
  bad[2].rect.x += 12;
  const finding = evaluateLayout(snapshot(bad), [rule]).findings[0];
  assert.equal(finding.status, 'fail');
  assert.equal(finding.deviation, 12);
  assert.equal(finding.evidence.length, 6);
});

test('single-column wrapping skips without falsely certifying consistency', () => {
  const finding = evaluateLayout(snapshot([elem('a', 10, 10), elem('b', 10, 100), elem('c', 10, 190)]), [rule]).findings[0];
  assert.equal(finding.status, 'skip');
  assert.equal(finding.code, 'measurement-unavailable');
});

test('truncated geometry is not used to claim a passing result', () => {
  const sample = snapshot([elem('a', 10, 10), elem('b', 126, 10), elem('c', 242, 10)]);
  sample.selectorCounts.cards = 300;
  assert.equal(evaluateLayout(sample, [rule]).findings[0].status, 'skip');
});

test('contract validation rejects invalid lane settings', () => {
  const contract = { selectors: { cards: '.card' }, rules: [rule] };
  assert.equal(parseContract(contract).rules[0].type, 'uniform-gaps');
  assert.throws(() => parseContract({ ...contract, rules: [{ ...rule, laneTolerance: -1 }] }), /laneTolerance/);
  assert.throws(() => parseContract({ ...contract, rules: [{ ...rule, axis: 'z' }] }), /axis must be x or y/);
});

test('Chromium reports a 12px grid deviation and correct CLI exit codes', t => {
  const good = run(['check', '--spec', 'examples/gallery.json', '--width', '768', '--json']);
  if (/Cannot find Chrome\/Chromium/.test(good.stderr ?? '')) {
    if (process.env.BRONTO_REQUIRE_CHROME) throw new Error(good.stderr);
    t.skip('Chromium unavailable'); return;
  }
  assert.equal(good.status, 0, good.stderr || good.stdout);
  assert.equal(JSON.parse(good.stdout).summary.failed, 0);
  const broken = run(['check', '--spec', 'examples/gallery.json', '--url', 'examples/gallery-broken.html', '--width', '768', '--json']);
  assert.equal(broken.status, 1, broken.stderr || broken.stdout);
  const finding = JSON.parse(broken.stdout).reports[0].findings.find(f => f.id === 'uniform-gallery-columns');
  assert.equal(finding.status, 'fail');
  assert.equal(finding.deviation, 12);
});
