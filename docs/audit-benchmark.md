# Controlled automatic-audit benchmark

This repository contains a small, versioned **hand-labeled diagnostic
regression suite** for the zero-contract layout audit. It is intentionally
not a marketing benchmark or proof of superiority over other tools.

## Run

From the source checkout:

    npm ci
    npm run build
    npm run benchmark:audit

For structured results:

    node scripts/benchmark-audit.mjs --assert --json --report /tmp/bronto-audit-benchmark.json

This benchmark requires Node 22+ and installed Chrome/Chromium. It runs
the actual Bronto Layout CLI against local, trusted HTML fixtures and
does not contact external websites or hosted services. The browser
sandbox remains enabled by default; ephemeral CI runners may explicitly
set BRONTO_CHROME_NO_SANDBOX=1 for trusted fixtures.

## Data and labels

The source is [audit-controlled-v0.1.json](../benchmarks/audit-controlled-v0.1.json).
Every case has a local fixture, viewport width, expected measured
detector codes, expected review codes and a human-authored rationale
derived from the source HTML/CSS. Thirteen initial cases cover:

- **Intentionally healthy:** internal horizontal scrolling, CSS ellipsis,
  a 1-pixel screen-reader-only label and a loaded embedded SVG are not
  errors.
- **Intentionally broken:** whole-document overflow, a visible broken
  image, and an overflowing leaf label without CSS ellipsis.
- **Responsive CSS interval:** overflow exists from 701 to 799 CSS
  pixels, but not at 700 or 800; coarse 600/900px sampling misses it.

Those labels were specified from the controlled fixture behavior,
not inferred from the Bronto Layout detector output. They do not replace
independent annotations of external production websites.

## Metrics and denominators

Each labeled evaluation unit is **one detector code for one viewport of
one fixture**, not one DOM element or a visual design assessment.

Measured codes: whole-document overflow, broken visible image.

Review-only codes: possibly clipped text, pending image loads,
and embedded frames whose internals were not inspected.

Confusion counts:

- TP: expected and detected.
- FP: not expected but detected.
- FN: expected but missing.
- TN: neither expected nor detected.

Precision = TP / (TP+FP) and recall = TP / (TP+FN). A metric with no
positive denominator is **null**, not a fabricated perfect score.
Incomplete browser inspections are excluded from the denominator
and explicitly recorded; in assertion mode, they fail the run.

Measured and review-only codes are scored separately. A classification
in the wrong category does not satisfy its expected label. Multiple
instances of one code on the same page count as one detector-unit;
this benchmark does not measure individual element localization.

Results include per-detector confusion counts, case mismatches,
runtime and Node version. Assertion mode returns exit 1 on incorrect
labels, exit 2 on incomplete observations/runtime failure.

## Known limitations and next steps

A perfect result on a tiny, curated benchmark says **nothing** about
precision or recall on arbitrary real websites. The examples share
authoring assumptions with the implementation.

Next, assemble at least 30 independently reviewed examples from art
portfolios, multilingual and RTL pages, applications, nested scroll
containers, intentional overlays, image cropping and interactive states.
Record verified false positives, false negatives and unmeasurable cases.
Compare other tools on exactly the same pages, viewport sizes, loading
conditions and independently reviewed labels.

See the [research roadmap](research-and-roadmap-2026-10-11.md).
