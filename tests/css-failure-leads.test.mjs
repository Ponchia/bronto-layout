import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCSSFailureAliases } from '../dist/css-failure-leads.js';
import { compactCheckReport } from '../dist/agent-report.js';

const report = findings => ({
  viewport: { width: 375, height: 900, direction: 'ltr' },
  summary: { passed: findings.filter(x => x.status === 'pass').length,
    failed: findings.filter(x => x.status === 'fail').length, skipped: 0 },
  findings
});

test('selects only aliases associated with failures and retains unrelated rules as unattributed', () => {
  const input = report([
    { id: 'aligned', type: 'align-edge', status: 'pass', evidence: [{ alias: 'unrelated', path: '#other' }] },
    { id: 'width-rule', type: 'size-range', status: 'fail', evidence: [{ alias: 'main', path: '#main' }] },
    { id: 'sizing-rule', type: 'contained', status: 'fail', evidence: [{ alias: 'main', path: '#main' }, { alias: 'gallery', path: '#gallery' }] },
    { id: 'missing-rule', type: 'align-edge', status: 'fail', evidence: [] }
  ]);
  const result = selectCSSFailureAliases(input, {
    main: '#main', gallery: '.gallery', unrelated: '#other'
  });
  assert.deepEqual(result.selectors, { main: '#main', gallery: '.gallery' });
  assert.deepEqual(result.ruleIdsByAlias, {
    main: ['width-rule', 'sizing-rule'], gallery: ['sizing-rule']
  });
  assert.deepEqual(result.unattributedRuleIds, ['missing-rule']);
});

test('compact reporting preserves source hints and the number of capped widths', () => {
  const empty = report([]);
  const cssSourceLeads = [{ width: 375, ruleIdsByAlias: { example: ['broken'] }, unattributedRuleIds: [] }];
  const compact = compactCheckReport({
    url: 'https://example.test/', reports: [empty], summary: empty.summary,
    transitions: [], cssSourceLeads, omittedCSSSourceWidths: 4
  });
  assert.deepEqual(compact.cssSourceLeads, cssSourceLeads);
  assert.equal(compact.omittedCSSSourceWidths, 4);
});
