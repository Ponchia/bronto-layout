# Source-built independent OSS website: Eleventy base blog

This is a separate, **manual** experiment for verifying Bronto Layout on the
generated output of an open-source website not maintained by our team. It
complements the [publicly deployed OSS site study](oss-field-study.md)
and [BrontoUI downstream CI integration](real-consumer-brontoui.md), without
rewriting their evidence or claiming independently labeled detector accuracy.

## Immutable independent source

The test checks out the official
[Eleventy base-blog starter](https://github.com/11ty/eleventy-base-blog)
at Git commit `94bd3b71d454da5b88eb505b8db6aea1cd0e9754`
(MIT-licensed, reviewed on 13 October 2026). The
[cohort manifest](../benchmarks/oss-source-built/manifest.json) pins that
revision, its own build command, and its generated output.

A disposable GitHub Linux runner clones **that exact commit** with credential
persistence disabled, installs the source project's locked dependencies,
and runs its `npm run build`. Bronto Layout itself is checked out at
the triggering source revision. The two source trees are not merged, and
neither project is published to a package registry.

The resulting static website is served over loopback-only HTTP
(`127.0.0.1:18778`) and inspected in sandboxed stable Chrome. This
avoids the deployed-site revision ambiguity of external URL audits and
preserves the real content, CSS and templates of an unrelated project.
It does **not** imply that external install/build dependencies are security
audited; they run only in an ephemeral read-only-permissions CI job.

## Approved website requirements

Bronto Layout verifies the generated homepage and About page at
320, 375, 768 and 1280 CSS pixels, using 11 explicit rules per route:

| Relationship | What it establishes |
| --- | --- |
| No measured document overflow | Horizontal content fits the usable viewport |
| Header, navigation, main, main heading and footer each exist | Core structures are present |
| Header, main and footer fit horizontally | Core page areas remain inside the viewport |
| Navigation fits within header | Navigation is not outside its containing layout |
| Main is centered in viewport | Follows the source-defined `max-width: 40em; margin: 0 auto` body layout |

The eight responsive states yield **88 approved assertions**.
These are limited semantic requirements, not a complete visual,
typographic, accessibility or usability certification.

## Controlled semantic regression

After the healthy build passes, the experiment temporarily injects
CSS into **generated homepage HTML only**. At desktop width it shifts the
main content column 18 CSS pixels to the right without leaving the large
viewport. Original upstream Git source files are not modified.

The generic zero-contract audit should report **zero measured overflow**.
The explicit `site-main-centered` contract must reject the shift by
approximately **18px**. This distinguishes semantic design-intent checking
from simply verifying that nothing protrudes beyond the document.

### Additional proposed mobile-width regression

Once the first mutation has been measured, the workflow restores the original
generated homepage HTML, then adds a **separate** CSS rule at widths up to
350px that gives `#main` a **360 CSS-pixel minimum width**. At a **320px
viewport**, this deliberately forces a measurable document-width excess
instead of merely changing the column's alignment. Both the generic
`document-horizontal-overflow` finding and the approved
`site-document-no-overflow` contract must reject it. The checks require the
measured extent to be meaningful, bounded, and approximately consistent
between generic and semantic results.

This is an independent controlled recall check on genuine generated-site
geometry, **not** a claim that the upstream Eleventy starter has this defect.
Neither CSS mutation touches its pinned Git source checkout. The negative
controls are measured individually after restoring the original generated
HTML, so they cannot accidentally hide or amplify one another.

If either result differs, the experimental workflow fails and preserves
the audit and screenshot evidence. It does not invent or report a real
upstream Eleventy defect: the mutation exists only on disposable generated
output.

Temporary GitHub artifacts use artifact-relative SHA-256 checksums and expire
after seven days. The visual evidence index deliberately distinguishes
viewports, source revision and mutation screenshots. The public repository
never commits third-party website screenshots, private credentials or data
collected from authenticated pages.

## Running and interpreting

The [manual pinned-source Eleventy workflow](../.github/workflows/oss-source-built-eleventy.yml)
accepts no arbitrary repository, URL, shell command or browser-action inputs.
It verifies the checkout SHA and generated files before running sandboxed
Chrome and restoring the generated CSS after the negative control.

**First source-built run completed.** The
[GitHub Actions execution 38425982845](https://github.com/Ponchia/bronto-layout/actions/runs/38425982845)
successfully checked out the reviewed Eleventy Git commit, built the genuine
site, verified **88/88 approved responsive assertions** across the homepage
and About page, then reproduced a **single 18 CSS px main-column centering
failure** in temporary generated HTML. Its generic audit remained clean
(**0 measured overflow findings**). All **four uploaded report checksums**
were independently verified after downloading the artifact.

That first run also exposed an evidence gap: Bronto Layout's
`check --evidence-dir` saves images for *failed* constraints only, so the
healthy initial states provided JSON but **no viewport screenshots**.
The workflow now runs a separate read-only `audit --evidence-dir` for each of
the **eight baseline page/width pairs**, and captures both unannotated
and annotated screenshots of the generated 18px mutation at 1280px.
An independent verifier requires each expected PNG, checks its recorded
viewport width and screenshot path, normalizes references to be
**artifact-relative**, records SHA-256 digests and creates an offline
`index.json` for review. Tests ensure wrong widths, tampering and false
mutation outcomes cannot silently succeed.

The [follow-up hosted visual run 38427558662](https://github.com/Ponchia/bronto-layout/actions/runs/38427558662)
has now succeeded at Bronto Layout commit `bda1df8`. It produced
**all 8 baseline screenshots plus 2 mutation screenshots** (the original
**18px centering fault**), the source-pinned reviewer `index.json` and
**23 checksum-verified artifact files**.
The downloaded PNGs were inspected at mobile and desktop widths: no obvious
defect was found in the sampled healthy viewports, while the deliberately
displaced homepage and annotated evidence show the content-column change.
A pixel-level comparison of the two 1280px screenshots confirms that rendered
pixels differ in the content-column region; the approved geometry rule measures
the induced **18px centering deviation** exactly.

The proposed extended workflow adds **two more 320px mutation screenshots**
(one generic-audit viewport image and one annotated contract failure) and
makes them required by the evidence verifier. Its human-review index will
record both distinct negative controls, including the measured overflow
and exact `site-document-no-overflow` rule failure. All four mutation
screenshots are SHA-256 verified and normalized to artifact-relative paths.

The new mobile-width control has local verifier tests and still requires
a fresh hosted browser run on the pinned Eleventy build. Until that run
succeeds, the previously published 23-file evidence result must not be
treated as proof of the additional control.

The screenshots and source build are retained in a separate private,
post-download verified archive. They are not published with the source
repository. These observations do **not** certify all responsive widths,
the full browsing experience, keyboard behavior, paint order or accessible
semantics. The original four-report run remains valid **mechanical** evidence,
not independent reviewer ground truth.

This study is not part of ordinary PR or deployment CI until maintenance costs
and reproducibility have been evaluated.

Evidence from one independently authored OSS codebase strengthens confidence
in cross-framework portability but is **not independent human ground truth,
real-world precision/recall, or evidence of external users adopting the CLI**.
