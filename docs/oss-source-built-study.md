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

If either result differs, the experimental workflow fails and preserves
the audit and screenshot evidence. It does not invent or report a real
upstream Eleventy defect: the mutation exists only on disposable generated
output.

Temporary GitHub artifacts use artifact-relative SHA-256 checksums and expire
after seven days. The public repository never commits third-party website
screenshots, private credentials or data collected from authenticated pages.

## Running and interpreting

The [manual pinned-source Eleventy workflow](../.github/workflows/oss-source-built-eleventy.yml)
accepts no arbitrary repository, URL, shell command or browser-action inputs.
It verifies the checkout SHA and generated files before running sandboxed
Chrome and restoring the generated CSS after the negative control.

**Status:** the source, tests and workflow are prepared; a complete successful
hosted run is required before claiming actual source-build verification.
If the healthy baseline fails, inspect source and generated output at the
specific commit rather than weakening contracts until they pass. This is
not part of ordinary PR or deployment CI until practical reproducibility
and maintenance costs are understood.

Evidence from one independently authored OSS codebase strengthens confidence
in cross-framework portability but is **not independent human ground truth,
real-world precision/recall, or evidence of external users adopting the CLI**.
