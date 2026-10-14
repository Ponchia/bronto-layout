import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { evaluateLayout } from '../dist/core.js';
import { parseContract } from '../dist/contract.js';

const cwd = path.resolve(import.meta.dirname, '..');
const cli = path.join(cwd, 'bin/bronto-layout.mjs');
const run = (args) => spawnSync(process.execPath, [cli, ...args], {
  cwd, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024,
  env: { ...process.env, BRONTO_TEST_INLINE_FIXTURE: '1', BRONTO_CHROME_NO_SANDBOX: '1' }
});
function skipIfNoChrome(t, result) {
  if (result.error?.code === 'ENOENT' || /Cannot find Chrome\/Chromium/.test(result.stderr || '')) {
    t.skip('Chromium unavailable'); return true;
  }
  return false;
}
const r = (x, y, width, height) => ({ x, y, width, height });
function fixture() {
  return {
    viewport: { width: 400, height: 800, direction: 'ltr' },
    document: { width: 400, height: 800 },
    selectors: {
      a: [{ tag: 'img', path: '#a', rect: r(10, 10, 90, 60) }],
      b: [{ tag: 'img', path: '#b', rect: r(120, 10, 90, 80) }],
      many: [{ tag: 'div', path: '#one', rect: r(0, 0, 10, 10) }]
    },
    selectorCounts: { a: 1, b: 1, many: 400 }
  };
}
test('same-size and size-range are deterministic and report actual dimensions', () => {
  const snapshot = fixture();
  const report = evaluateLayout(snapshot, [
    { id: 'width-match', type: 'same-size', a: 'a', b: 'b', axis: 'width' },
    { id: 'height-match', type: 'same-size', a: 'a', b: 'b', axis: 'height' },
    { id: 'button-min-width', type: 'size-range', element: 'a', axis: 'width', min: 100 }
  ]);
  assert.deepEqual(report.findings.map(x => x.status), ['pass', 'fail', 'fail']);
  assert.deepEqual(report.findings.map(x => x.deviation), [0, 20, 10]);
  assert.deepEqual(report.findings[1].paths, ['#a', '#b']);
});
test('selector-count uses exact count even when geometry extraction is bounded', () => {
  const report = evaluateLayout(fixture(), [{ id: 'many-elements', type: 'selector-count', element: 'many', exactly: 400 }]);
  assert.equal(report.summary.passed, 1);
  assert.equal(report.findings[0].measured, 400);
});
test('strict validation rejects malformed or ambiguous dimension rules', () => {
  const base = {
    schemaVersion: 1, selectors: { a: '#a', b: '#b' },
    rules: [{ id: 'size', type: 'same-size', a: 'a', b: 'b', axis: 'width' }]
  };
  assert.equal(parseContract(base).rules.length, 1);
  assert.throws(() => parseContract({ ...base, rules: [{ ...base.rules[0], axis: 'pixels' }] }), /axis must be width/);
  assert.throws(() => parseContract({ ...base, rules: [{ id: 'range', type: 'size-range', element: 'a', axis: 'height' }] }), /specify min or max/);
  assert.throws(() => parseContract({ ...base, rules: [{ id: 'range', type: 'size-range', element: 'a', axis: 'width', min: 200, max: 100 }] }), /min exceeds max/);
});
test('CLI checks real open shadow roots and returns composed DOM paths', t => {
  const result = run(['check', '--spec', 'examples/shadow.json', '--json']);
  if (skipIfNoChrome(t, result)) return;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const data = JSON.parse(result.stdout);
  assert.equal(data.summary.passed, 6);
  assert.equal(data.reports[0].findings.find(x => x.id === 'all-card-elements').measured, 2);
  assert.match(data.reports[0].findings[0].paths[1], /#card-a >>>/);
});
test('CLI reports exact and bounded selector matches on a large document', t => {
  const result = run(['inspect', '--url', 'examples/large-dom.html', '--width', '375', '--selector', 'items=.item', '--json']);
  if (skipIfNoChrome(t, result)) return;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const snapshot = JSON.parse(result.stdout).snapshots[0];
  assert.equal(snapshot.selectorCounts.items, 315);
  assert.equal(snapshot.selectors.items.length, 250);
});
test('CLI fails fast on malformed deep selector rather than claiming no match', t => {
  const result = run(['inspect', '--url', 'examples/shadow.html', '--selector', 'bad=#card-a >>>', '--json']);
  if (skipIfNoChrome(t, result)) return;
  assert.equal(result.status, 2);
  const error = JSON.parse(result.stdout);
  assert.equal(error.mode, 'error');
  assert.match(error.error.message, /Invalid deep selector/);
});
test('an all-out-of-width-range contract is unverified, not a green empty check', t => {
  const base = JSON.parse(fs.readFileSync(path.join(cwd, 'examples/layout.json'), 'utf8'));
  base.rules = base.rules.map(rule => ({...rule, minWidth: 2000, maxWidth: 2200}));
  // The spec is passed through a private temporary file, not via user input.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bronto-inapplicable-'));
  try {
    fs.writeFileSync(path.join(tmp,'layout.json'), JSON.stringify({...base,url:path.join(cwd,'examples/healthy.html')}));
    const result = run(['check','--spec',path.join(tmp,'layout.json'),'--widths','320,375','--json','--compact']);
    if (skipIfNoChrome(t,result)) return;
    assert.equal(result.status,2,result.stderr||result.stdout);
    const parsed=JSON.parse(result.stdout);
    assert.equal(parsed.error.code,'NO_APPLICABLE_RULES');
    assert.match(parsed.error.message,/No applicable layout rules/);
  } finally {fs.rmSync(tmp,{recursive:true,force:true});}
});

test('--fail-on-skip does not fail intentionally out-of-range rules', t => {
  const result = run(['check', '--spec', 'examples/layout.json', '--widths', '320,375', '--fail-on-skip', '--json']);
  if (skipIfNoChrome(t, result)) return;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.summary.skipped, 2);
  assert.equal(report.reports[0].findings.find(f => f.id === 'equal-card-gaps').code, 'outside-width-range');
});
test('contained axis x permits below-the-fold content while rejecting horizontal overshoot', () => {
  const snapshot = fixture();
  snapshot.selectors.a[0].rect = r(10, 1500, 90, 60);
  const horizontal = evaluateLayout(snapshot, [{id:'in-x',type:'contained',element:'a',in:'viewport',axis:'x'}]);
  const both = evaluateLayout(snapshot, [{id:'in-both',type:'contained',element:'a',in:'viewport'}]);
  assert.equal(horizontal.summary.passed, 1);
  assert.equal(both.summary.failed, 1);
  snapshot.selectors.a[0].rect.x = 390;
  assert.equal(evaluateLayout(snapshot, [{id:'in-x',type:'contained',element:'a',in:'viewport',axis:'x'}]).findings[0].deviation, 80);
});
test('contained axis is strict and cannot contain misspellings', () => {
  const c = {selectors:{a:'#a'},rules:[{id:'fit',type:'contained',element:'a',in:'viewport',axis:'horizontal'}]};
  assert.throws(()=>parseContract(c), /axis must be x, y or both/);
});
test('violations carry bounded factual DOM evidence instead of guessed CSS causes', () => {
  const snapshot = fixture();
  snapshot.selectors.a[0].styles = { display: 'block', boxSizing: 'border-box' };
  const output = evaluateLayout(snapshot, [{ id: 'mismatch', type: 'same-size', a: 'a', b: 'b', axis: 'height' }]);
  const finding = output.findings[0];
  assert.equal(finding.status, 'fail');
  assert.equal(finding.evidence?.length, 2);
  assert.equal(finding.evidence?.[0].styles?.boxSizing, 'border-box');
  assert.equal(finding.evidence?.[0].rect.height, 60);
});
test('document overflow exposes measured element leads without claiming they are causes', () => {
  const snapshot = fixture();
  snapshot.document.width = 460;
  snapshot.overflowCandidates = [{ path: '#wide', rect: r(20, 20, 440, 60), leftOverflow: 0,
    rightOverflow: 60, position: 'relative', overflowX: 'visible' }];
  const finding = evaluateLayout(snapshot, [{ id: 'overflow', type: 'document-overflow' }]).findings[0];
  assert.equal(finding.status, 'fail');
  assert.equal(finding.deviation, 60);
  assert.equal(finding.overflowCandidates?.[0].path, '#wide');
  assert.deepEqual(finding.paths, ['#wide']);
});
