import test from 'node:test';
import assert from 'node:assert/strict';
import { setInlineFixtureContent } from '../bin/inline-fixture.mjs';

function cdpFixture(tree = { frameTree: { frame: { id: 'main' } } }) {
  const calls = [];
  return { calls, async send(method, params) {
    calls.push({ method, params });
    return method === 'Page.getFrameTree' ? tree : {};
  }, eval() { assert.fail('HTML fixture must never be interpolated into JavaScript'); } };
}

test('inline fixture HTML is sent unchanged as CDP data without executable interpolation', async () => {
  const cdp = cdpFixture();
  const html = '<!doctype html><ScRiPt>globalThis.example = "` ${}; \\u2028";</ScRiPt>';
  await setInlineFixtureContent(cdp, 'from-navigation', html);
  assert.deepEqual(cdp.calls, [{ method: 'Page.setDocumentContent', params: { frameId: 'from-navigation', html } }]);
});

test('navigation without a frame identifier resolves the actual document frame', async () => {
  const cdp = cdpFixture();
  await setInlineFixtureContent(cdp, undefined, '<p>test</p>');
  assert.deepEqual(cdp.calls, [
    { method: 'Page.getFrameTree', params: undefined },
    { method: 'Page.setDocumentContent', params: { frameId: 'main', html: '<p>test</p>' } }
  ]);
});

test('missing frame or nontext fixture fails without a document write', async () => {
  const cdp = cdpFixture({});
  await assert.rejects(setInlineFixtureContent(cdp, undefined, '<p>test</p>'), /no document frame/);
  assert.ok(cdp.calls.every(call => call.method !== 'Page.setDocumentContent'));
  await assert.rejects(setInlineFixtureContent(cdp, 'main', null), /must be HTML text/);
});

test('CDP document errors propagate instead of reporting a fixture as loaded', async () => {
  const cdp = { async send() { throw new Error('frame detached'); } };
  await assert.rejects(setInlineFixtureContent(cdp, 'main', '<p>test</p>'), /frame detached/);
});
