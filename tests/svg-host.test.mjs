import assert from 'node:assert/strict';
import test from 'node:test';
import { captureSvgHostGeometry } from '../dist/svg.js';
import { evaluateHostLayout } from '../dist/host.js';

const SVG = 'http://www.w3.org/2000/svg';
const HTML = 'http://www.w3.org/1999/xhtml';
const R = { a: 2, b: 0, c: 0, d: 2, e: 100, f: 200 };
const style = { display: 'block', visibility: 'visible', opacity: '1' };
function rootFixture() {
  const document = { defaultView: { getComputedStyle: node => ({ ...style, ...node.styleMock }) } };
  const root = {
    namespaceURI: SVG, localName: 'svg', isConnected: true, parentElement: null,
    ownerDocument: document, viewBox: { baseVal: { x: 0, y: 0, width: 500, height: 400 } },
    getScreenCTM: () => R,
    contains: element => {
      for (let node = element; node; node = node.parentElement)
        if (node === root) return true;
      return false;
    },
  };
  return root;
}
function graphic(root, transform = { ...R, e: 140, f: 260 }, box = { x: 0, y: 0, width: 80, height: 40 }) {
  return {
    namespaceURI: SVG, localName: 'rect', parentElement: root,
    ownerDocument: root.ownerDocument, isConnected: true,
    getScreenCTM: () => transform,
    getBBox: () => box,
  };
}
const capture = (root, targets, overrides = {}) => captureSvgHostGeometry({
  root,
  inventoryComplete: true,
  viewport: { width: 390, height: 844 },
  revision: 'model-rev-7',
  targets, ...overrides,
});
const alignment = {
  targets: { a: 'a', b: 'b' },
  rules: [{ id: 'top', type: 'align-edge', a: 'a', b: 'b', edgeA: 'top', tolerance: 1 }],
};

test('maps actual SVG geometry through root inverse CTM into one SVG user coordinate space', () => {
  const root = rootFixture();
  const a = graphic(root);
  const b = graphic(root, { ...R, e: 340, f: 260 });
  const snapshot = capture(root, [{ id: 'a', element: a }, { id: 'b', element: b }]);
  assert.equal(snapshot.space, 'svg');
  assert.equal(snapshot.revision, 'model-rev-7');
  assert.deepEqual(snapshot.root, { x: 0, y: 0, width: 500, height: 400 });
  assert.deepEqual(snapshot.elements[0], {
    id: 'a', space: 'svg', measurement: 'measured',
    rect: { x: 20, y: 30, width: 80, height: 40 },
  });
  assert.equal(evaluateHostLayout(snapshot, alignment).assessment, 'pass');
  assert.equal(evaluateHostLayout(snapshot, alignment).summary.skipped, 0);
});
test('a 12 SVG-unit shift is detected in the same approved contract', () => {
  const root = rootFixture();
  const a = graphic(root);
  const b = graphic(root, { ...R, e: 340, f: 284 });
  const report = evaluateHostLayout(capture(root, [
    { id: 'a', element: a }, { id: 'b', element: b },
  ]), alignment);
  assert.equal(report.assessment, 'fail');
  assert.equal(report.findings[0].deviation, 12);
  assert.deepEqual(report.findings[0].paths, ['host://svg/a', 'host://svg/b']);
});
test('a rotated root and transformed child resolve back to exact SVG root user units', () => {
  const root = rootFixture();
  const rotated = { a: 0, b: 2, c: -2, d: 0, e: 100, f: 200 };
  root.getScreenCTM = () => rotated;
  const child = graphic(root, { ...rotated, e: 40, f: 240 });
  const result = capture(root, [{ id: 'text', element: child }]);
  for (const [key, expected] of Object.entries({ x: 20, y: 30, width: 80, height: 40 }))
    assert.ok(Math.abs(result.elements[0].rect[key] - expected) < 1e-6, key);
});
test('foreignObject HTML label projects its CSS border box, not invented SVG glyph ink', () => {
  const root = rootFixture();
  const foreign = { namespaceURI: SVG, localName: 'foreignObject', parentElement: root,
    ownerDocument: root.ownerDocument, isConnected: true };
  const label = { namespaceURI: HTML, localName: 'span', parentElement: foreign,
    ownerDocument: root.ownerDocument, isConnected: true,
    getBoundingClientRect: () => ({ x: 200, y: 260, width: 100, height: 30 }) };
  const result = capture(root, [{ id: 'label', element: label }]);
  assert.deepEqual(result.elements[0].rect, { x: 50, y: 30, width: 50, height: 15 });
  const report = evaluateHostLayout(result, {
    targets: { label: 'label' },
    rules: [{ id: 'in-graphic', type: 'contained', element: 'label', in: 'viewport' }],
  });
  assert.equal(report.assessment, 'pass');
});
test('out-of-root, disconnected and non-foreignObject HTML cannot become verified graphics', () => {
  const root = rootFixture();
  const otherRoot = rootFixture();
  const foreign = graphic(otherRoot);
  const detached = graphic(root); detached.isConnected = false;
  const outsideHtml = { namespaceURI: HTML, localName: 'span', parentElement: root,
    ownerDocument: root.ownerDocument, isConnected: true,
    getBoundingClientRect: () => ({ x: 200, y: 260, width: 100, height: 30 }) };
  const result = capture(root, [
    { id: 'different-root', element: foreign },
    { id: 'unmounted', element: detached },
    { id: 'html-outside-foreign-object', element: outsideHtml },
  ]);
  assert.equal(result.elements.filter(x => x.measurement === 'unavailable').length, 3);
});
test('hidden, zero-size and throwing geometry sources remain explicitly unverified', () => {
  const root = rootFixture();
  const hidden = graphic(root); hidden.styleMock = { opacity: '0' };
  const zero = graphic(root, R, { x: 20, y: 30, width: 0, height: 40 });
  const broken = graphic(root); broken.getBBox = () => { throw new Error('not rendered'); };
  const result = capture(root, [
    { id: 'hidden', element: hidden },
    { id: 'zero', element: zero },
    { id: 'broken', element: broken },
    { id: 'known-unmounted', element: null },
  ]);
  assert.equal(result.elements.filter(el => el.measurement === 'unavailable').length, 4);
  assert.equal(evaluateHostLayout(result, {
    targets: { a: 'known-unmounted' },
    rules: [{ id: 'size', type: 'size-range', element: 'a', axis: 'width', min: 10 }],
  }).assessment, 'unverified');
});
test('unlisted identities fail; they never pass as an empty selector collection', () => {
  const root = rootFixture();
  const result = capture(root, [{ id: 'a', element: graphic(root) }]);
  const report = evaluateHostLayout(result, {
    targets: { a: 'a', missing: 'not-in-inventory' },
    rules: [{ id: 'size', type: 'size-range', element: 'a', axis: 'width', min: 40 }],
  });
  assert.equal(report.assessment, 'fail');
  assert.equal(report.coverage.missing, 1);
});
test('elements in defs and symbols cannot certify painted geometry', () => {
  const root = rootFixture();
  const definitions = { namespaceURI: SVG, localName: 'defs', parentElement: root,
    ownerDocument: root.ownerDocument, isConnected: true };
  const element = graphic(root);
  element.parentElement = definitions;
  const snapshot = capture(root, [{ id: 'template', element }]);
  assert.equal(snapshot.elements[0].measurement, 'unavailable');
  assert.equal(evaluateHostLayout(snapshot, {
    targets: { template: 'template' },
    rules: [{ id: 'w', type: 'size-range', element: 'template', axis: 'width', min: 20 }],
  }).assessment, 'unverified');
});

test('invalid root, singular CTM, missing user bounds and incomplete inventories fail closed', () => {
  const root = rootFixture();
  root.isConnected = false;
  assert.throws(() => capture(root, []), /detached/);
  root.isConnected = true;
  root.getScreenCTM = () => ({ a: 1, b: 0, c: 0, d: 0, e: 0, f: 0 });
  assert.throws(() => capture(root, []), /invertible/);
  root.getScreenCTM = () => R;
  root.viewBox = null;
  assert.throws(() => capture(root, []), /positive viewBox/);
  assert.deepEqual(capture(root, [], { rootBounds: { x: 1000, y: 2000, width: 50, height: 50 } }).root,
    { x: 1000, y: 2000, width: 50, height: 50 });
  assert.throws(() => capture(root, [], { inventoryComplete: false }), /complete/);
  assert.throws(() => capture(root, [], {
    rootBounds: { x: 0, y: 0, width: 100, height: 100 },
    viewport: { width: 10, height: 20 },
  }), /CSS-pixel/);
});
test('duplicate IDs and over-budget collections are refused without partial success', () => {
  const root = rootFixture();
  assert.throws(() => capture(root, [
    { id: 'same', element: graphic(root) },
    { id: 'same', element: graphic(root) },
  ]), /unique/);
  assert.throws(() => capture(root, Array.from({ length: 257 }, (_, i) => ({
    id: String(i), element: graphic(root),
  }))), /bounded/);
});
