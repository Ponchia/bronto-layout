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

## Extended fixture suite: v0.2

The original `audit-controlled-v0.1.json` is deliberately **immutable**:
its 13 fixture/viewport labels remain available to reproduce the original
evaluation. An extended, separately versioned
`audit-controlled-v0.2.json` adds 18 cases (31 total) with six new HTML
fixtures covering:

- CSS `@container` thresholds at 320, 375, 430, 450 and 768px
  (a viewport-only media-query scanner cannot infer all container behavior).
- Deliberately oversized RTL content, checked at mobile/tablet/desktop widths.
- A missing resource inside **open Shadow DOM**, where the DOM observer can
  inspect the inner image.
- An embedded iframe whose internals are intentionally **not** inspected;
  this must be labeled a coverage warning, not a passing inner-layout test.
- Intentional overlay badges, inner scrolling and CSS ellipsis with no
  automatic errors or warnings.
- Mixed image states: one visible failed image, one loaded vector and one
  broken resource hidden using `display:none`.

Run only the extended dataset:

    npm run benchmark:audit:expanded

Or retain structured, labeled results:

    node scripts/benchmark-audit.mjs --manifest benchmarks/audit-controlled-v0.2.json --assert --json --report /tmp/bronto-audit-v0.2.json

The first controlled Chromium run scored **31/31 exact label matches**, with
20 measured positive detector/viewport labels and 5 review positives,
0 mismatches or incomplete samples. This is reproducible evidence about the
**hand-authored fixtures**, not an independent production-site accuracy
estimate and not a comparison against Snug or Polypane. Both v0.1 and v0.2
remain available as separately versioned datasets; v0.3 now runs in the Node 24 CI benchmark step, while the ordinary CLI matrix continues on Node 22/24.

**Next benchmark milestone:** independently review at least 30 external
real-world application states with evidence-based true/false labels,
including plausible intentional overflow, localization and art-direction
cases. We should publish per-detector precision/recall on that separately
labeled dataset, and evaluate competitors under identical browser and
content-state conditions before claiming superiority.

## Element-localization accuracy: v0.3

A **separately versioned** `audit-controlled-v0.3.json` keeps the full
31-case v0.2 detector/viewport classification matrix unchanged, then adds
expected **exact DOM element paths** for two useful diagnostic categories.
The v0.3 dataset contains **33 cases**: those 31 original cases plus two
cases with repeated IDs in different open Shadow DOM roots. Browser diagnostics
must report the composed path including the host, not an ambiguous bare ID.

- `broken-image`: visible resource failures must point to the actual
  image, including the tested open Shadow DOM resource.
- `possible-text-clipping`: review-only warnings must point to the
  actual text element, not another clipped element on the same page.

Run the additional evaluation:

    npm run benchmark:audit:locations

Or retain the scored JSON:

    node scripts/benchmark-audit.mjs --manifest benchmarks/audit-controlled-v0.3.json --assert --json --report /tmp/bronto-audit-v0.3.json

This reports **separate element-path precision/recall**, with TP/FP/FN for
each expected issue-type+DOM-path pair. Crucially, a detector that reports
the correct *category* on the **wrong DOM element** now counts as both a
localization false negative and a false positive. Extra spurious element
references are also penalized even when the expected element was found.

There is no finite universe of "true negative" DOM paths; for that reason,
element localization deliberately publishes **no TN count**. When there are
no positive labels/predictions, precision or recall is `null`, not a
manufactured perfect score. If the audit truncates its element list or
omits the element path, the localization case is classified **incomplete**
and excluded from the denominator (assertion mode fails).

A case's `expectedLocations` labels are human-authored from the checked
HTML/CSS fixtures. They are not generated from Bronto's detector output.
This does not establish real-world localization precision, nor does it
infer unique locators for closed shadow roots or inaccessible frame contents.

The first complete controlled Chromium evaluation of v0.3 on 12 October
2026 returned **33/33 case-level classification matches**, 22 measured
positive issue-code/viewport labels and 5 review positives, and
**15/15 correctly attributed individual element paths** (no observed
localization FP/FN). These labels were hand-authored from controlled
fixtures; the results do not estimate performance on independent
production sites or establish relative quality against Snug or Polypane.

The v0.3 benchmark runs instead of v0.2's browser repetition in the
Node 24 CI job; unit tests still check the historical label versions
for reproducibility.

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
