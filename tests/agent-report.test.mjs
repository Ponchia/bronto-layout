import test from 'node:test';
import assert from 'node:assert/strict';
import { compactCheckReport, compactCompareReport } from '../dist/agent-report.js';
import { compareReports } from '../dist/compare.js';

const viewport = width => ({ width, height: 900, direction: 'ltr' });
const finding = (id, status, code, delta = 0) => ({
  id, type: 'align-edge', status, code,
  message: id + ' ' + status,
  ...(status === 'fail' || status === 'pass'
    ? { deviation: delta, tolerance: 1, paths: ['#a', '#b'] } : {})
});
const report = (width, findings) => ({
  viewport: viewport(width),
  summary: {
    passed: findings.filter(f => f.status === 'pass').length,
    failed: findings.filter(f => f.status === 'fail').length,
    skipped: findings.filter(f => f.status === 'skip').length
  },
  findings
});

test('compact checks include actionable findings and exact tested widths, but not passing rules', () => {
  const records = [
    report(320, [finding('gallery', 'fail', 'constraint', 19), finding('text', 'pass', 'constraint'),
      finding('pending', 'skip', 'measurement-unavailable'), finding('outside', 'skip', 'outside-width-range')]),
    report(768, [finding('gallery', 'pass', 'constraint'), finding('text', 'pass', 'constraint')])
  ];
  const compact = compactCheckReport({
    url: 'https://example.test/gallery', reports: records, summary: { passed: 3, failed: 1, skipped: 2 },
    transitions: [],
    cssBreakpointScan: { thresholds: [640], widths: [639, 640, 641], addedWidths: [639, 640, 641] }
  });
  assert.deepEqual(compact.sampledWidths, [320, 768]);
  assert.equal(compact.failures.length, 1);
  assert.equal(compact.failures[0].deviation, 19);
  assert.equal(compact.unmeasurable.length, 1);
  assert.equal(compact.unmeasurable[0].id, 'pending');
  assert.equal(compact.summary.skipped, 2);
  assert.deepEqual(compact.cssBreakpointScan.thresholds, [640]);
  assert.equal(JSON.stringify(compact).includes('"text"'), false);
});

test('compact reports cap large findings without silently omitting violations', () => {
  const failed = Array.from({ length: 151 }, (_, i) => finding('rule-' + i, 'fail', 'constraint', i));
  const compact = compactCheckReport({
    url: 'https://example.test/', reports: [report(375, failed)],
    summary: { passed: 0, failed: 151, skipped: 0 }, transitions: []
  });
  assert.equal(compact.failures.length, 100);
  assert.equal(compact.omittedFailures, 51);
  assert.equal(compact.summary.failed, 151);
});

test('compact comparison differentiates new regressions from existing failures', () => {
  const before = [report(320, [finding('new', 'pass', 'constraint'), finding('old', 'fail', 'constraint', 10)])];
  const after = [report(320, [finding('new', 'fail', 'constraint', 12), finding('old', 'fail', 'constraint', 10)])];
  const comparison = compareReports('https://original.test/', 'https://changed.test/', before, after);
  const compact = compactCompareReport(comparison);
  assert.equal(compact.summary.regressions, 1);
  assert.equal(compact.summary.candidateFailures, 2);
  assert.equal(compact.changes.length, 1);
  assert.equal(compact.changes[0].ruleId, 'new');
  assert.deepEqual(new Set(compact.remainingFailures.map(f => f.id)), new Set(['new', 'old']));
  assert.equal('baseline' in compact, false);
});
