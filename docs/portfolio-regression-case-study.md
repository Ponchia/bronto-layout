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

From your Node.js project, using the published package (Node.js 22+ and an
installed Chrome/Chromium):

```sh
npm install --save-dev @ponchia/layout@0.5.0-beta.2
npx --no-install bronto-layout doctor --verify-launch
npx --no-install bronto-layout check \
  --spec node_modules/@ponchia/layout/examples/portfolio-alignment.json --json
# Expected exit 0: alignment passes at 768 and 1280px.
# Mobile alignment is intentionally skipped.

npx --no-install bronto-layout check \
  --spec node_modules/@ponchia/layout/examples/portfolio-alignment.json \
  --url node_modules/@ponchia/layout/examples/portfolio-alignment-broken.html --json
# Expected exit 1: alignment fails at 768 and 1280px.

npx --no-install bronto-layout compare \
  --spec node_modules/@ponchia/layout/examples/portfolio-alignment.json \
  --baseline node_modules/@ponchia/layout/examples/portfolio-alignment-healthy.html \
  --url node_modules/@ponchia/layout/examples/portfolio-alignment-broken.html --json
# Expected exit 1: a new alignment regression at desktop widths.
```

Observe that no other semantic contract must fail. A generic audit may return no measured failures because nothing is necessarily overflowing or broken: **it cannot know the desired alignment without the authored rule**.

The [first-run guide](quickstart.md) includes the healthy/broken screenshots,
actual output and expected summaries from the installed beta.2. To regenerate
those assets, follow [presentation evidence](presentation.md). Contributor
source builds remain in [CONTRIBUTING.md](../CONTRIBUTING.md).

To preserve the annotated Chromium screenshot yourself, add `--evidence-dir reports/portfolio-evidence` to the failing `check` command and inspect `check-768px.png`. A cropped, unmodified CLI capture is included in [the example image](assets/portfolio-alignment-768.png); the image is evidence from this **local fixture only**, not an independent label.

## Try a real site

Replace the fixture URL with your development server while keeping a project-specific contract checked into your own repository. Prefer stable selectors (well-named classes or `data-testid`) instead of auto-generated DOM paths. Start with a few meaningful constraints and validate those at widths where the design requires them.

For before/after review, compare the old and new build with the *same* approved rules. Review whether the selectors still refer to the intended elements after refactoring. Unknown or partially inspected geometry is not proof of correctness.

## Coverage and limitations

The fixture is a deterministic example, not external benchmark data. It tests ordinary DOM geometry at three widths; it does not prove that typography, overlapping paint, lazy media, arbitrary intermediate widths or mobile art direction are correct. Human inspection remains necessary. See [field benchmark guidelines](field-benchmark.md) before reporting measured real-world detector accuracy.
