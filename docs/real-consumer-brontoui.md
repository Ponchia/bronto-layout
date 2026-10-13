# Bronto Layout in a real website's required CI: BrontoUI

This is a reproducible **first-party downstream integration**, not evidence
of adoption by an unaffiliated developer or independently labeled detector
accuracy. [BrontoUI](https://github.com/Ponchia/bronto-ui) runs Bronto Layout
against its **generated static website** before deployment, without a hosted
service or a published npm package.

## The consumer owns the contracts

BrontoUI stores its accepted geometry requirements in
[`test/layout`](https://github.com/Ponchia/bronto-ui/tree/main/test/layout).
It checks three distinct, locally served documents:

| Document | Widths (CSS px) | Approved rules | Passing evaluations |
| --- | --- | ---: | ---: |
| Documentation homepage | 320, 340, 375, 768, 1280 | 7 | 35/35 |
| Operations example's outer shell | 320, 375, 768, 1280 | 7 | 28/28 |
| **Direct service dashboard** (`/demo/service.html`) | 320, 340, 375, 430, 768, 1280 | 16 | 96/96 |
| **Total** | 15 viewport observations | 30 | **159/159** |

Rules cover measured horizontal document overflow, expected selectors,
element containment, dashboard rail/content non-overlap, and an explicit
alignment between the dashboard toolbar and jobs panel. These are the
consumer's chosen layout intentions, not automatically accepted guesses.
A passing contract cannot prove paint order, typography quality, arbitrary
screen widths, accessibility, or the full user experience.

**Important frame boundary:** The operations page asserts that its iframe's
*outer shell* fits, while the dashboard contract navigates directly to the
dashboard document. This tests the same document as a standalone route, **not**
the rendering of its interior at the iframe's actual embedded size, or all
its interactive states. BrontoUI retains its separate Playwright
Chromium/Firefox/WebKit suite.

## Positive and negative controls

The GitHub workflow [`layout-contract-smoke.yml`](https://github.com/Ponchia/bronto-ui/blob/main/.github/workflows/layout-contract-smoke.yml)
builds BrontoUI, serves its output on a loopback HTTP port, checks out
Bronto Layout at a reviewed **immutable source commit**, and starts stable
Google Chrome with no sandbox bypass requested. It does not accept an
arbitrary public URL or collect authenticated screenshots.

The workflow first checks the healthy generated website. It then makes two
**temporary mutations to generated CSS only**, each of which must fail a
specific approved rule. Tracked source files remain unchanged and generated
styles are restored:

| Negative control | Generic automatic audit | Semantic contract |
| --- | --- | --- |
| Restore a historical 320px headline overflow | Root overflow is measured | Must reject the **3px** overflow |
| Translate the 1280px dashboard jobs panel by 8px | **0 measured errors** | Must reject **8px toolbar/panel misalignment** |

The second control shows a useful distinction: a page can remain fully
inside the viewport while breaking a relationship the designer intended
to preserve. The automatic audit does not know that intention; a reviewed
contract does.

## Verified progression from optional check to deployment gate

1. [**BrontoUI PR #253**](https://github.com/Ponchia/bronto-ui/pull/253)
   introduced two site-owned contracts. Its
   [first passing browser run](https://github.com/Ponchia/bronto-ui/actions/runs/38360831568)
   validated **35/35 homepage** and **28/28 operations shell** evaluations
   and rejected the historical overflow, initially as a supplemental check.
2. [**BrontoUI PR #254**](https://github.com/Ponchia/bronto-ui/pull/254)
   added the dashboard's 16-rule contract and independent 8px alignment
   mutation. Its [passing workflow](https://github.com/Ponchia/bronto-ui/actions/runs/38363083875)
   verified the expanded source site. The same dashboard contract passed
   **96/96** locally against the separate dashboard redesign
   [PR #252](https://github.com/Ponchia/bronto-ui/pull/252) at its then-current
   commit. That compatibility check does not certify the redesign visually.
3. [**BrontoUI PR #255**](https://github.com/Ponchia/bronto-ui/pull/255)
   connected the reusable layout workflow to the repository's **required
   `ci-gate`**. Layout failures, cancellations or unverified skips now
   block application-changing PRs and the GitHub Pages deployment path.
   A successfully classified docs-only change may skip expensive browser
   checks. Its [full PR CI](https://github.com/Ponchia/bronto-ui/actions/runs/38365902910),
   [merged-main CI](https://github.com/Ponchia/bronto-ui/actions/runs/38367258077)
   and [GitHub Pages deployment](https://github.com/Ponchia/bronto-ui/actions/runs/38368332891)
   all succeeded at merge commit `08faafe`. The production gate also retains
   BrontoUI's preexisting E2E and security checks.

This integration addresses a repository's real build workflow, not just a
synthetic unit fixture. Its before/after defect measurements and controlled
mutations remain **first-party evidence**; no independent human field
labels, external-user adoption, or general precision/recall estimate follow
from them.

### Browser-startup lesson

The initial downstream attempt failed **before inspecting the website**:
the hosted runner had both a development Chromium executable and stable
Google Chrome, but autodiscovery selected a Chromium build that could not
start with the runner's sandbox configuration. The successful consumer run
explicitly selected `/usr/bin/google-chrome` and completed a sandboxed
`doctor --verify-launch` preflight. This motivated merged
[Bronto Layout PR #77](https://github.com/Ponchia/bronto-layout/pull/77),
which prefers stable Chrome in browser autodetection. Browser executable
selection alone does not prove successful startup; do not silently add
`--no-sandbox` as a recovery strategy for untrusted sites.

## Apply the pattern to another repository

Keep a small set of responsive contracts beside the website that owns
them. Build and serve the actual candidate commit on loopback, pin the CLI to
a reviewed release or immutable source commit, and demand a passing healthy
case plus a **specific intentional failure**. Prefer an explicit layout
relationship when generic overflow rules cannot express the desired design.
Preserve coverage warnings and keep browser E2E and visual review alongside
Bronto Layout. Treat tool upgrades as reviewed CI changes.

[BrontoUI's contract README](https://github.com/Ponchia/bronto-ui/blob/main/test/layout/README.md)
contains its exact selectors, boundaries and negative controls. npm
publication is a separate, still-unapproved project milestone.
