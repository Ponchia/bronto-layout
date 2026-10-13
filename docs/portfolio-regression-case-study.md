# Portfolio alignment: a reproducible layout regression

This example represents a common portfolio issue: **an image starts lower than the first paragraph**, even though both elements are still fully on screen. It is a **controlled local reproduction inspired by real portfolio-layout work**, not a claim that Bronto detected a particular historical production bug. Both fixture versions contain only self-contained markup and CSS.

The healthy and broken versions differ in one intentional styling rule applied to desktop widths:

```css
@media (min-width: 768px) {
  body.regressed .artwork { transform: translateY(18px); }
}
```

The contract in [`examples/portfolio-alignment.json`](../examples/portfolio-alignment.json) explicitly states that the first paragraph and image share a top edge. It also checks for missing artwork and horizontal page overflow.

## Reproduce

From the repository root, after `npm ci`:

```sh
npm run build
node bin/bronto-layout.mjs check --spec examples/portfolio-alignment.json --json
# Expected exit 0; alignment passes at 768 and 1280px, mobile alignment is intentionally skipped.

node bin/bronto-layout.mjs check --spec examples/portfolio-alignment.json \
  --url examples/portfolio-alignment-broken.html --json
# Expected exit 1: alignment fails at 768 and 1280px.

node bin/bronto-layout.mjs compare --spec examples/portfolio-alignment.json \
  --baseline examples/portfolio-alignment-healthy.html \
  --url examples/portfolio-alignment-broken.html --json
# Expected exit 1: a new alignment regression at the desktop widths.
```

Observe that no other semantic contract must fail. A generic audit may return no measured failures because nothing is necessarily overflowing or broken: **it cannot know the desired alignment without the authored rule**.

## Try a real site

Replace the fixture URL with your development server while keeping a project-specific contract checked into your own repository. Prefer stable selectors (well-named classes or `data-testid`) instead of auto-generated DOM paths. Start with a few meaningful constraints and validate those at widths where the design requires them.

For before/after review, compare the old and new build with the *same* approved rules. Review whether the selectors still refer to the intended elements after refactoring. Unknown or partially inspected geometry is not proof of correctness.

## Coverage and limitations

The fixture is a deterministic example, not external benchmark data. It tests ordinary DOM geometry at three widths; it does not prove that typography, overlapping paint, lazy media, arbitrary intermediate widths or mobile art direction are correct. Human inspection remains necessary. See [field benchmark guidelines](field-benchmark.md) before reporting measured real-world detector accuracy.
