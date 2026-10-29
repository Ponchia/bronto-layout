# Host-owned geometry: canvases, diagrams and SVG

Bronto Layout can evaluate **approved** spatial relationships on geometry a
host application already measures. It does not render, position, move or correct
nodes. `@ponchia/layout/host` has no DOM, Node, browser or Spatial dependency.

```ts
import { evaluateHostLayout } from '@ponchia/layout/host';

const result = evaluateHostLayout({
  space: 'world',
  revision: documentRevision,
  inventoryComplete: true,
  root: { x: 1000, y: 2000, width: 800, height: 600 },
  viewport: { width: 390, height: 844, direction: 'ltr' },
  elements: [
    { id: 'group', space: 'world', measurement: 'measured',
      rect: { x: 1040, y: 2040, width: 400, height: 200 } },
    { id: 'note', space: 'world', measurement: 'measured',
      rect: { x: 1080, y: 2080, width: 120, height: 80 } },
  ],
}, {
  schemaVersion: 1,
  targets: { group: 'group', note: 'note' },
  rules: [{ id: 'note-in-group', type: 'contained',
    element: 'note', in: 'group', tolerance: 0 }],
});
// result.assessment: pass | fail | unverified
// result.findings[0].paths: ['host://world/note']
```

The host converts **all** rectangles into one coordinate space before calling
the evaluator. For Spatial, parent-relative node coordinates must first be
resolved to world coordinates; camera scaling belongs to the screen adapter,
not to this function. For an SVG, use one stable SVG user coordinate space.
The `root` rectangle may start away from (0,0); it is normalized internally.
`viewport.width` is the real CSS-pixel viewport for responsive width rules,
while `root.width` is in host coordinates for `in: 'viewport'` containment.
These values must not be conflated. World-relative results do not prove
screen-visible font sizes, canvas paint, connector routing, or clipped DOM.

`inventoryComplete: true` means the scoped object inventory is complete and
stable at the provided revision. A bounded/truncated collection must instead
fail closed. A known object that has not been measured uses
`measurement: 'unavailable'` **without a rectangle**, producing a
measurement-unavailable skip, never an invented zero. An absent identity fails
as a missing element, even when the remainder of a repeated alias happens to
satisfy a gap or count rule. Mixed world/screen/SVG spaces, duplicate IDs, invalid
rectangles and unsupported browser-only contracts are rejected.

The host adapter supports constraints backed by geometry: edges, containment,
centering, non-overlap, gaps, sizes and counts. It refuses document overflow,
layout stability, intrinsic image aspect and rendered clipping rules because
host rectangles cannot prove these. Use browser or renderer instrumentation for
those separate concerns. Automatic audits of arbitrary overlaps and automatic
CSS fixes remain outside this contract.

Treat only `assessment === 'pass'` as a complete passing inspection. A failed
approved rule is `fail`; no applicable rules or unavailable measurements
without a failure are `unverified`. Persist reports only with the source
revision, approved contract, inspected selection and safe evidence policy.
Compare reports from the same contract and coordinate space; a passing world
geometry result says nothing about a different camera/view or browser state.
