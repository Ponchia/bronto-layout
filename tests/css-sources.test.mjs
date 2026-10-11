import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeMatchedCSS } from '../dist/css-sources.js';

const css = (sheet, selector, properties, origin='regular') => ({
  rule: { origin, selectorList: { text: selector },
    style: { styleSheetId: sheet, cssProperties: properties } }
});
const prop = (name, value, line) => ({
  name, value, ...(line === undefined ? {} : { range: { startLine: line, startColumn: 1 } })
});

test('external author CSS includes observed URL and verified 1-indexed declaration line', () => {
  const sheets = new Map([['sheet-a', {
    styleSheetId: 'sheet-a', sourceURL: 'https://example.test/styles/site.css', isInline: false
  }]]);
  const result = summarizeMatchedCSS({ matchedCSSRules: [
    css('', 'body', [prop('margin', '8px')], 'user-agent'),
    css('', '.user-rule', [prop('width', '800px')], 'user'),
    css('sheet-a', '.gallery', [prop('display', 'grid', 2), prop('gap', '16px', 3),
      prop('color', '#f00', 4), prop('gap', '16px')])
  ] }, sheets);
  assert.equal(result.relevantRuleCount, 1);
  assert.equal(result.rules[0].selector, '.gallery');
  assert.equal(result.rules[0].sourceUrl, 'https://example.test/styles/site.css');
  assert.equal(result.rules[0].sourceKind, 'external-stylesheet');
  assert.deepEqual(result.rules[0].declarations, [
    { name: 'display', value: 'grid', line: 3 },
    { name: 'gap', value: '16px', line: 4 }
  ]);
});

test('an inline stylesheet never receives fabricated external stylesheet line numbers', () => {
  const sheets = new Map([['inline-1', { sourceURL: 'https://example.test/page.html', isInline: true }]]);
  const result = summarizeMatchedCSS({ matchedCSSRules: [
    css('inline-1', '.heading', [prop('margin-left', '12px', 3)])
  ] }, sheets);
  const rule = result.rules[0];
  assert.equal(rule.sourceKind, 'inline-stylesheet');
  assert.equal(rule.documentUrl, 'https://example.test/page.html');
  assert.equal(rule.sourceUrl, undefined);
  assert.equal(rule.declarations[0].line, undefined);
});

test('element style attributes and matched rules are independent evidence', () => {
  const result = summarizeMatchedCSS({
    matchedCSSRules: [css('', '.card', [prop('width', '400px')])],
    inlineStyle: { cssProperties: [prop('width', '240px'), prop('opacity', '0.3'), prop('padding', '8px')] }
  });
  assert.equal(result.relevantRuleCount, 2);
  assert.equal(result.rules[1].sourceKind, 'element-style');
  assert.equal(result.rules[1].selector, 'element style attribute');
  assert.deepEqual(result.rules[1].declarations.map(x=>x.name), ['width', 'opacity', 'padding']);
});

test('bounded CSS reports disclose omitted rules and ignore presentation-only properties', () => {
  const items = Array.from({ length: 20 }, (_,i)=>css('', '.rule-'+i, [prop('width', i+'px')]));
  const output = summarizeMatchedCSS({ matchedCSSRules: [
    css('', '.presentation-only', [prop('color', 'red')]), ...items
  ] });
  assert.equal(output.relevantRuleCount, 20);
  assert.equal(output.rules.length, 16);
  assert.equal(output.omittedRules, 4);
  assert.equal(output.rules[0].selector, '.rule-4');
});
