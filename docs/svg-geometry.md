# Renderer-provided SVG geometry (optional)

`@ponchia/layout/svg` captures a **complete, explicitly scoped** set of
measured SVG rectangles in one root **SVG user-coordinate space**, without
creating a browser, inferring layout intent or importing a framework. It is a
DOM-only adapter on top of the framework-neutral `@ponchia/layout/host` engine.

## Host usage

A renderer must supply a mounted `<svg>` root and its stable, model-owned
element references. A generated DOM index is not a stable identity. Use the
model's revision, not a timestamp generated during inspection.

```ts
import { captureSvgHostGeometry } from '@ponchia/layout/svg';
import { evaluateHostLayout } from '@ponchia/layout/host';

// These are references resolved by the owning renderer, not selector strings
// supplied by Bronto Layout or guessed by a layout checker.
const snapshot = captureSvgHostGeometry({
  root: infographicSvg,
  revision: currentModelRevision,
  inventoryComplete: true,
  viewport: { width: window.innerWidth, height: window.innerHeight },
  targets: [
    { id: 'step-one', element: stepOneSvgElement },
    { id: 'step-two', element: stepTwoSvgElement },
    { id: 'unmounted-but-known', element: null },
  ],
});
const report = evaluateHostLayout(snapshot, {
  targets: { first: 'step-one', second: 'step-two' },
  rules: [{
    id: 'same-top-edge',
    type: 'align-edge',
    a: 'first',
    b: 'second',
    edgeA: 'top',
    tolerance: 2,
  }],
});
// Only report.assessment === 'pass' is a verified passing observation.
```

The SVG root must be attached, have an invertible screen CTM, and provide a
finite positive `viewBox`. If a host has a valid user-coordinate root without
a `viewBox`, it may pass `rootBounds` explicitly; the library never guesses
from its CSS size. The `viewport` field is the actual **CSS-pixel** browser
viewport used to select responsive rules, not the SVG width.

The adapter maps four local bounding-box corners to screen coordinates using
`getScreenCTM()`, then applies the inverse root matrix. This respects
nested transforms and root zoom/rotation while preserving SVG user units.
A native SVG graphics element uses `getBBox()`. An HTML element inside an SVG
`foreignObject` uses its CSS border rectangle and the inverse root matrix.
The results are axis-aligned rectangles in the SVG coordinate plane.

## Measurement limits and fail-closed behavior

- These boxes describe SVG geometry and `foreignObject` HTML border boxes,
  **not actual glyph ink**, rendered stroke extents, rasterized paint or
  clipping. A separate browser-rendering check is still required for these.
- Hidden, detached, unrendered, zero-area, out-of-root, cross-document and
  unsupported elements are explicitly **unavailable**. Content inside
  `defs`, `symbol`, `clipPath`, `mask`, `marker`, `pattern` and `filter`
  is not proof of directly painted geometry.
- A root with missing user bounds or a singular screen transform throws.
  Partial inventories, duplicate identities, invalid viewports and more than
  256 targets are refused rather than truncated.
- A known but currently unavailable target must still be listed with
  `element: null` so an approved contract cannot silently ignore it.
  `evaluateHostLayout` returns **unverified** for unavailable measurements;
  absent approved identities produce failures.
- CSS transforms on HTML inside a rotated `foreignObject` may inflate the
  screen-axis-aligned rectangle. They must not be interpreted as pixel-exact
  paint evidence or as permission to modify a model.

This module is deliberately independent of renderer internals: AntV, D3,
native SVG, and other clients may resolve their own stable IDs to elements.
It never moves anything. A caller should associate the observation with its
source revision and verify the same approved contract after an intentional
renderer or model change.

The framework-neutral host adapter remains usable without a browser or DOM;
only importing and invoking the optional SVG module requires a DOM.
