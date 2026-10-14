# First-party beta pilot results — 14 October 2026

**Scope:** controlled, repository-owned website/App builds using the GitHub-distributed Bronto Layout beta. These are engineering observations, **not independent precision/recall, usability ratings, or adoption evidence**. We have deliberately deferred external promotion until real integration yields useful and misleading examples. No analytics ingestion, hosted reporting service, automatic CSS repair or npm registry publication was added.

## Release and reproducibility

- [v0.5.0-beta.1 GitHub prerelease](https://github.com/Ponchia/bronto-layout/releases/tag/v0.5.0-beta.1), exact source commit `779709052378185bb4f7a0d1727fff7d7e91ac74`.
- The published `ponchia-layout-0.5.0-beta.1.tgz` SHA-256 is `f471a03498980d80ce304aa45a04e8b468736f51478822b7620ffc147a7b1de8`. Its checksum and CLI/public exports were independently verified after downloading the GitHub release; the package is **not on npm**.
- Source builds passed TypeScript, lint, 233 browser-free tests, the controlled browser regression suites and the Node 22/24 Chromium and hosted macOS release gates. This demonstrates internal correctness of tested cases, not behavior on every site/browser.

## Pilot observations

| Owned project and surface | Reproducible observed result | CI/integration state | Important limitation |
| --- | --- | --- | --- |
| [BrontoUI website](https://github.com/Ponchia/bronto-ui/pull/260): homepage, operations shell and direct dashboard | Previously approved contracts covered 159/159 evaluations; the beta upgrade's interior-width probe caught a **deliberate 8px dashboard alignment island at 403px** that both original endpoints missed. Existing 3px root-overflow and 8px alignment controls remain. | [PR #260](https://github.com/Ponchia/bronto-ui/pull/260) merged after all PR checks; layout is already a required consumer gate. | Checking the dashboard URL does not measure its interior *as embedded in an iframe*; CSS/DOM checks do not certify graphical or accessibility correctness. |
| [Sense6](https://github.com/Ponchia/sense6/pull/162): English and Arabic (RTL) galleries plus English Learn | The real generated routes passed their approved responsive contracts. A generated-only **12px local semantic misalignment** failed its intended relation with no generic measured overflow. | [PR #162](https://github.com/Ponchia/sense6/pull/162) merged with layout, browser, visual, Lighthouse and release checks green. | Passing directions, landmarks and containment does not evaluate user comprehension or every interactive state. No personal response, measurement or journal data was inspected. |
| Personal website (private source): homepage and article | Controlled locally built Astro output passed **70/70** homepage and **56/56** article assertions at seven sampled widths; a generated-only **12px** alignment mutation failed one approved relation. | Local-only contract and agent instructions merged to the private repository. The previously unusable ARC layout workflow was retired; no website-hosted layout gate is claimed. | GitHub-hosted jobs were blocked by account billing/spending status. The private ARC runner lacks Chromium runtime libraries (`libnspr4.so`) and refused package installation; the local trusted-fixture run used a browser-process sandbox override because the devbox has no user namespaces. This is **not** authorized for arbitrary or authenticated sites. |
| Spatial (private workspace): Capacity Lab and Pattern Studio source HTML, report document | Two standalone App HTML sources passed **72/72 each** across nine sampled widths. A generated-only **12px** controls shift failed the reviewed contract while zero-contract audit reported **no measured issue**. The real report route returned an intentionally script-disabled document, classified **unverified**. | The isolated source-only pilot is merged into the private Spatial repository after its separate CI qualification. No live canvas, stored App or deployed Spatial service was changed. | This does not validate iframe placement dimensions, live SDK/connected data, SVG painting, user-owned reports or Spatial's canvas geometry. The report must retain `Content-Security-Policy: sandbox` without `allow-scripts`. |

Only the first two project links above are public. Private project source, PR links and logs are intentionally not replicated in this public repository. All negative controls are **deliberate synthetic changes**, not previously undiscovered natural defects. Reported zero generic audit issues is not proof the mutated design was correct: it demonstrates why an approved semantic relationship matters.

## Product finding: protected reports must fail closed

The initial Spatial report-node test using `v0.5.0-beta.0` timed out in `Runtime.evaluate` on an HTML response carrying enforced CSP `sandbox` without `allow-scripts`. An isolated *same-byte* HTTP differential established that the ordinary document passed, while the sandboxed document could not execute the geometry probe.

[Issue #94](https://github.com/Ponchia/bronto-layout/issues/94) and [merged fix #95](https://github.com/Ponchia/bronto-layout/pull/95) introduced the typed `CSP_SANDBOX_UNINSPECTABLE` error with **exit 2** rather than a timeout or false pass, shipped in `v0.5.0-beta.1`. The fix does **not** strip CSP, add script permissions, or claim to inspect opaque frame contents. `Content-Security-Policy-Report-Only` and script-allowed sandbox documents are regression controls, so a mere mention of sandboxing is not a blanket refusal.

This change is justified by a specific downstream failure. It is not a reason to implement a generic screenshot dashboard or to infer intended design from unreviewed browser geometry.

## What this evidence does and does not establish

**Established:** the released CLI is installable from a verified GitHub tarball; approved contracts can reject controlled layout regressions that generic mechanical audits miss; a responsive probe can find a defect between passing coarse endpoints; CI integration can operate on the consumer's own build without uploading private browser evidence; unsupported script-disabled content now fails visibly and promptly.

**Unestablished:** independent human classification of natural real-world defects or false positives; per-detector precision/recall; reproducible performance on an idle reference machine; adoption or first-use success by unaffiliated developers; complete cross-browser, deep-scroll, iframe-internal or visual accessibility correctness. We cannot infer these from test counts or GitHub Actions status.

## Ongoing first-party measurement

The [weekly owned-site layout pulse](first-party-pulse.md) is an opt-in/scheduled
GitHub Actions job with a fixed six-route allowlist. It runs approved contracts
at seven responsive widths per route and retains only sanitized counts, observed
coverage and rule IDs. The first [manual execution on `main`](https://github.com/Ponchia/bronto-layout/actions/runs/38632220615) completed 6/6 routes, **238/238 passing rules**, zero skips and all 42 requested viewport samples in approximately 44 seconds of browser checks. The largest unsampled interior gap is still 255 CSS pixels. A failure requires human triage before changing CSS; longitudinal observations are **not** independent field labels or automated precision/recall estimates. It does not inspect private website source revisions,
user state, Spatial canvas placements or opaque iframe internals.

## Next development decisions

1. **Continue first-party use before adding detectors.** Collect any actual missed defects, incorrect strict failures, frequent review-only noise, layout state/setup errors, runtime cost and whether an agent proposed a useful fix. Use a private copy of the [trial worksheet](beta-trial-template.md) and sanitize public findings.
2. **Validate the developer workflow independently.** Obtain outside-user first-use feedback ([issue #64](https://github.com/Ponchia/bronto-layout/issues/64)) and separate human labels for real cases ([issue #27](https://github.com/Ponchia/bronto-layout/issues/27)). Do not label an agent-generated suggestion as independent human ground truth.
3. **Retain honest coverage.** Script-disabled reports are unverified; embedded iframe geometry must be checked in the actual framed viewport before claiming placement correctness. A standalone document and the canvas frame are different observables. A future read-only CDP snapshot mode would need distinct tests and limitations rather than relaxing the report CSP.
4. **Keep distribution friction explicit.** Work with the available GitHub release and pinned commit Actions. npm publishing still needs authorized publisher setup. The private ARC Chrome prerequisite is infrastructure work, not a request to disable sandboxing or raise privileges in the website workflow.

No external announcement or social post is authorized by these trials.
