# Historical OSS layout regression: Svelte playground mobile switch

This case is a **source-inspired controlled recreation** based on the
real, independently maintained Svelte website's
[mobile playground overflow fix, PR #548](https://github.com/sveltejs/svelte.dev/pull/548)
(merged 23 October 2024). It is deliberately **not** presented as a
historical Svelte website capture, external human ground truth, or
a claim that the current Svelte playground is defective.

## The original upstream change

The Svelte PR identified an input/output switch hidden on small screens.
The recorded change in
[`packages/repl/src/lib/Repl.svelte`](https://github.com/sveltejs/svelte.dev/pull/548/files)
was a single CSS declaration added to a flex item:

```css
.container {
  position: relative;
  flex: 1;
  height: 100%;
  min-height: 0;
}
```

The actual source has additional styles and interactive components.
Bronto Layout does **not** bundle that source, rebuild the 2024 Svelte site,
or assert fidelity to its original DOM, browser environment or screenshot.

## Controlled, source-inspired reproduction

To exercise the same CSS mechanism, two small inert local HTML fixtures
recreate a flex-column mobile playground with an oversized editor region
and an input/output switch positioned at the bottom of the flex child.

- [Broken HTML](../examples/oss-svelte-flex-min-broken.html) preserves the
  flex item's default automatic minimum height.
- [Fixed HTML](../examples/oss-svelte-flex-min-fixed.html) differs in layout
  by the original `min-height: 0` correction.
- [Reviewed layout contract](../examples/oss-svelte-flex-min.json)
  checks the switch's presence, **vertical containment inside the viewport**,
  and measured horizontal document overflow at **320 and 375 CSS px** with
  a **420px** viewport height.

A real Chromium run of these inert, checked-in fixtures produced:

| Observation | Broken | Fixed |
| --- | --- | --- |
| Input/output button exists in DOM | Yes | Yes |
| Approved vertical viewport containment | **Fail, 58px below viewport** | Pass |
| Root horizontal overflow contract | Pass | Pass |
| Zero-contract audit measured issues | **0** | **0** |

The broken page's screenshot shows the switch missing from the visible
viewport; the fixed page's screenshot shows it along the bottom.
This is a useful negative control: simply counting selectors or relying on
generic horizontal overflow does **not** prove that a key control remains
available inside the visible viewport.

The explicit containment contract detects the failure without an additional
heuristic detector or a new Bronto Layout rule type.

## How to reproduce safely

With Node.js 22+ and a normally sandboxed compatible Chrome installation,
run these local fixture checks after `npm ci` and `npm run build`:

```sh
node bin/bronto-layout.mjs check \
  --spec examples/oss-svelte-flex-min.json \
  --url examples/oss-svelte-flex-min-broken.html \
  --height 420

node bin/bronto-layout.mjs check \
  --spec examples/oss-svelte-flex-min.json \
  --url examples/oss-svelte-flex-min-fixed.html \
  --height 420
```

The first command is expected to exit **1**, with the two viewport-containment
checks failing. The second is expected to exit **0** with all six
approved contract evaluations passing. The automated Chromium regression
suite also verifies that a separate zero-contract audit remains clean.

Only the test suite's bundled inert HTML fixtures may use the project's
existing trusted-disposable-fixture sandbox policy. Do **not** bypass the
browser sandbox when inspecting real third-party sites.

## Scope and next research question

The reproduction demonstrates that **existing explicit layout relationships**
can expose a real class of OSS UI problem that generic document overflow
checks miss. It does **not** prove Bronto Layout would have caught the
original Svelte issue without knowing which switch and viewport mattered.
Nor does a passing containment rule guarantee that a control is clickable,
not covered by another layer, keyboard-reachable or visible to a person.

Before inventing a general paint/occlusion detector, we should independently
reproduce more known historical OSS fixes and establish how often the
approved `contained`/`no-clipping` rules already express them. A new
automatic detector would need a defensible false-positive and coverage
model, not merely one successful synthetic case.
