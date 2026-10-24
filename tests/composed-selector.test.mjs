import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { queryComposedElements } from '../dist/composed-selector.js';

function withDocument(t, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { value, configurable: true });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
    else delete globalThis.document;
  });
}

test('composed selectors trim literal segments and traverse only open shadow roots', t => {
  const target = {};
  const visited = [];
  const root = { querySelectorAll(selector) { visited.push(selector); return [target]; } };
  withDocument(t, { querySelectorAll(selector) {
    visited.push(selector);
    return [{ shadowRoot: root }, { shadowRoot: null }];
  } });
  assert.deepEqual(queryComposedElements(' \t.host\n >>> \t.child \n'), [target]);
  assert.deepEqual(visited, ['.host', '.child']);
});

test('empty composed segments are rejected before querying the document', t => {
  withDocument(t, { querySelectorAll() { assert.fail('invalid selectors must not reach the DOM'); } });
  for (const selector of ['', ' \t ', '>>>', '.host >>>', '>>> .leaf', '.host >>> >>> .leaf']) {
    assert.throws(() => queryComposedElements(selector), /Invalid deep selector/);
  }
});

test('long whitespace cannot cause polynomial selector splitting', { timeout: 10000 }, () => {
  // Isolate the regression in a killable child: the previous regexp can retry
  // on every whitespace position and must not hang the parent test process.
  const moduleUrl = new URL('../dist/composed-selector.js', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import assert from 'node:assert/strict';
    import { queryComposedElements } from ${JSON.stringify(moduleUrl)};
    globalThis.document = { querySelectorAll(selector) {
      assert.equal(selector, '.subject'); return [];
    }};
    queryComposedElements(' '.repeat(500000) + '.subject' + ' '.repeat(500000));
  `], { timeout: 5000, encoding: 'utf8' });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
});
