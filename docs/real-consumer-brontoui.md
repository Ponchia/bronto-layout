# Bronto Layout in a real website CI workflow: BrontoUI

This is a reproducible **first-party downstream integration**, not evidence
of adoption outside the Bronto projects or independently labeled detector
accuracy. It demonstrates using Bronto Layout to check an actual website
build before deployment **without npm publication or a hosted service**.

## What is running

[BrontoUI](https://github.com/Ponchia/bronto-ui) generates a static public
documentation website. Its [dedicated GitHub Actions workflow](https://github.com/Ponchia/bronto-ui/blob/main/.github/workflows/layout-contract-smoke.yml)
checks two pages using [website-owned versioned contracts](https://github.com/Ponchia/bronto-ui/tree/main/test/layout):

- **Homepage:** 7 rules at 320, 340, 375, 768 and 1280 CSS pixels.
- **Operations example shell:** 7 rules at 320, 375, 768 and 1280 pixels.

Rules assert no document-level horizontal overflow, required visible
elements, and intended horizontal containment. They do **not** verify the
embedded operations demo's iframe interior, color/paint, accessibility,
interactions, all generated pages, or unseen application states.

The workflow builds BrontoUI's static output, checks out Bronto Layout at
a reviewed **immutable Git commit**, builds the CLI, then serves the site
on loopback. It uses sandboxed Chrome and accepts no arbitrary URL input.
Finally, it temporarily restores the historical 320px heading bug in
**generated CSS only**, verifies that the approved overflow rule fails,
and restores the generated CSS. No tracked site source is mutated.

## Observed browser evidence

[BrontoUI PR #253](https://github.com/Ponchia/bronto-ui/pull/253)
introduced the first downstream workflow. Its
[successful run](https://github.com/Ponchia/bronto-ui/actions/runs/38360831568)
completed in approximately 39 seconds, including dependency installation:

| Case | Approved evaluations | Result |
| --- | ---: | --- |
| Built homepage, five widths | 35 | All passed |
| Built operations shell, four widths | 28 | All passed |
| Intentionally broken homepage, 320px | One required failure | 3 CSS px document overflow caught |

The negative control is a controlled CSS mutation, **not** an independent
human field label. It establishes that this concrete contract rejects
a historically observed regression without using a screenshot-diff service.

The same supplemental workflow also passed on a separate
[operations dashboard refinement PR #252](https://github.com/Ponchia/bronto-ui/pull/252)
([browser run 38362124626](https://github.com/Ponchia/bronto-ui/actions/runs/38362124626)):
again **35/35 homepage checks, 28/28 operations outer-shell checks**, and
the intentional **3px regression was correctly rejected**. That second
site change is useful lifecycle evidence, but the iframe-contained dashboard
itself still requires the consuming project's regular E2E/visual review.

### A real browser-selection issue

The initial run failed **before visiting the site**. The GitHub runner had
both a development Chromium build and stable Google Chrome, but the CLI's
old autodiscovery selected `/usr/bin/chromium`. That binary aborted in
sandbox startup. The successful rerun selected `/usr/bin/google-chrome`,
whose `doctor --verify-launch` confirmed a live debugging connection with
**no sandbox bypass requested**.

That experience motivated
[Bronto Layout PR #77](https://github.com/Ponchia/bronto-layout/pull/77),
which prefers stable Chrome when no explicit browser override is given.
The downstream workflow remains pinned to the tool commit and working
Chrome executable it validated.

Browser executable detection is not proof of sandboxed startup. Do not
use `--no-sandbox` as an automatic recovery strategy for unfamiliar pages.

## Adopting this pattern elsewhere

Keep approved layout relationships next to the consuming website, use a
small set of stable selectors and responsive widths, and test a healthy
state plus at least one deliberate defect. Pin an immutable source commit
until the npm alpha is authorized and published. Verify any subsequent
source or package upgrade before changing the CI gate.

This workflow is presently **supplemental** to BrontoUI's required checks.
Promote it only after repeated stable PR/main runs. It complements rather
than replaces browser E2E, accessibility, security and visual review.
