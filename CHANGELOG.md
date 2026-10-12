# Changelog

## Unreleased

- Correct image-aspect validation: `object-fit: none` preserves source proportions despite a differently shaped image element box, so the constraint is now marked unmeasurable (like `cover`, `contain` and `scale-down`) rather than reported as distortion.
- Make automatic audit comparisons robust to DOM reordering: uniquely identified broken-image resources can move across DOM paths/hosts without triggering fabricated regressions or improvements. For ambiguous same-count path changes, report an unverified element identity rather than guessing; genuine net count increases remain measurable.
- **Report-semantics clarification:** `audit` `summary.verified` is now false for a known uninspected embedded frame, even when its top-document walk completed. New `summary.supportedScopeMeasured` keeps that narrower fact explicit. Default CLI coverage policy and capture integrity still distinguish uninspected frames from truncated traversal; `--fail-on-coverage-gaps` remains opt-in.


- Stabilize the browser layout-shift regression fixtures: schedule deliberate geometry changes after the first paint and expose an explicit readiness marker only after the following render frames. Tests wait for observed state instead of assuming a load-relative timer always fires after paint on a busy runner; no change to the production Layout Instability collector.

- Add static offline `field-benchmark review-gallery`, giving independent reviewers a grouped screenshot contact sheet without detector predictions or generated labels. Hash checks reject tampered/non-PNG images; manual capture artifacts include the gallery and blank review worksheet by default.

- Add opt-in `audit --full-page-evidence --evidence-dir DIR` and `field-benchmark capture --full-page-evidence`, saving size-bounded document screenshots from Chromium CSS layout metrics. Reports disclose top-left clipping and document coverage instead of claiming full visual verification; reviewer packets and field scores check the additional image hash when requested.


- Recover from intermittent Chromium startup stalls with at most one additional isolated launch when the `DevToolsActivePort` endpoint never appears. Failed child processes and temporary profiles are cleaned up before retrying; input/navigation/check failures are never retried. Startup remains bounded and surfaces explicit errors when both launches fail.
- Update GitHub Actions checkout/setup-node/upload-artifact to maintained Node 24-compatible v7 major tags; disable checkout credential persistence in read-only CI, macOS and manual smoke workflows. No application runtime changes.


- Add `review-draft` to replay *unapproved* browser-observed relationships against a later revision at the same recorded widths and scenario, reporting still-satisfied/changed/unverified with distinct exit codes. No rule is approved or automatically repaired.
- Disclose selector discovery limit reasons when the 500-element candidate limit, 20-unique-selector cap or six-repeated-group cap prevents further inspection. Review reports retain this coverage evidence.


- Add opt-in `audit --frame-inventory` from Chromium frame-tree and DOMSnapshot evidence, with strict bounded reporting, URL sanitization, and baseline/candidate comparison coverage. A snapshot does not constitute an inner-frame layout audit.
- Prevent independently reviewed but partially covered iframe states from inflating field benchmark true negatives or recall. Distinguish capture integrity from diagnostic coverage, including historical capture compatibility; add opt-in frame inventory to the manual allowlisted field capture workflow.


- Unify explicitly open Shadow DOM selector resolution for measurements, readiness and browser actions, with regression fixtures.
- Preserve reviewed browser scenarios and declarative actions from `suggest` into `approve` / `check`, including explicit desktop and normal-motion overrides.
- Report the supported audit scope and known iframe coverage gaps; add opt-in `audit --fail-on-coverage-gaps` (exit 2 when evidence is incomplete).
- Extract browser discovery, CDP transport and session ownership from the CLI; add an install `doctor` command.
- Add opt-in independent-process `batch --parallel 1..4`, cold-process profiling and the fast browser-free test suite. Performance is host-dependent and not yet established for real websites.
- Add a hash-verified `field-benchmark.mjs review-packet` generator; it intentionally leaves all human labels pending.
- Add public-alpha checklist, 10-minute onboarding, and macOS portability/packaging CI (publication still pending).

- Add review-first `suggest` and `approve` CLI commands to draft browser-observed semantic layout contracts, with bounded selector discovery, width-scoped repeated gaps and explicit human acceptance.
- Add a separate real-website benchmark pipeline with an allowlisted 30-state first-party capture manifest, initial-viewport screenshots, content-hash provenance, human-only labeling and missing-evidence-aware scoring.
- Permit opt-in raw audit screenshots without treating screenshot contents as automatic detector results.

- Add optional zero-contract before/after audit comparisons via
  `audit --baseline URL --url URL`, with new measured regression,
  improvement and review-only changes kept separate.
- Combine baseline/candidate CSS media-query boundaries in automatic
  comparisons and fail closed on incomplete or ambiguous DOM evidence.

- Add separately labeled per-element audit localization evaluation for
  broken-image and possible-text-clipping findings: exact DOM-path
  TP/FP/FN, wrong-element penalties and explicitly incomplete sample handling.
- Preserve bounded diagnostic omission counts in compact automatic-audit
  reports so downstream tools do not mistake missing evidence for negatives.

- Add opt-in browser-observed CSS container-query inventory, showing computed container sizes and declared pixel threshold candidates without treating them as viewport breakpoints.
- Expand the controlled zero-contract audit benchmark to an immutable v0.2 with 31 labeled responsive fixtures (container queries, RTL overflow, open Shadow DOM, iframe gaps, intentional overlap and mixed image states). Keep v0.1 reproducible and run both versions in CI.

- Add a manually triggered read-only four-site zero-contract audit with preserved JSON and CLI logs.
- Add a 13-case hand-labeled zero-contract audit benchmark, per-detector confusion matrices and a Node 24 CI regression gate.

- Add experimental `audit --url` zero-contract CLI findings for
  measured root overflow, broken visible images, and review-only clipping
  and pending image evidence; preserve bounded coverage and explicit exit codes.
- Suppress visually hidden 1x1 assistive labels (verified on Sense6
  English/Arabic), intentional CSS ellipsis and nested scroll containers
  from naive clipping false positives.


- Add an opt-in first-party live-site DOM geometry quiet-window audit for the personal site and Sense6 English/Arabic.
- Harden the loopback-only HTML fixture server: deny hidden files, unsupported asset extensions and realpath/symlink escapes; cover it with direct Node tests and package verification.

- Add an opt-in live-site laboratory layout-shift audit for the personal website and Sense6 English, Arabic and Learn routes.

- Add Chromium laboratory layout-shift capture, an explicit `layout-stability` contract rule, scored comparisons, and bounded affected-element evidence.
- Exclude recent-input shifts and report unsupported or truncated observations as unmeasurable instead of passing.

- Prepare npm package v0.4.0 metadata for public distribution, without
  publishing to the registry.
- Test an installed tarball in isolation (compiled library, CLI executable,
  package metadata and bundled Chromium fixtures) on Node.js 22 and 24.
- Read the CLI version directly from package metadata to prevent drift.
- Add a manually triggered live-site smoke mode for browser-observed CSS
  source hints on the personal website and Sense6, with retained JSON artifacts.

- Allow opt-in `check --css-sources` and `scan --css-sources`
  to attach bounded matched CSS evidence directly to failing layout rules;
  preserve unattributed failures and omitted-width counts.

- Add opt-in `inspect --css-sources` CDP author CSS stylesheet/declaration hints, including explicit open Shadow DOM selectors and bounded output.
- Distinguish external CSS source lines from inline style sheets to prevent fabricated positions or automatic root-cause claims.

- Add opt-in batch execution for the live-site smoke workflow and create report parent directories before writing successful CLI results.

- Add declarative sequential CLI batches with per-job locale/viewport state, offline dry-run previews and aggregate JSON/exit codes.

- Add opt-in `--json --compact` agent reports preserving violations, unmeasurable checks, and sampled widths.
- Emit machine-readable JSON for fatal CLI errors and write explicit failure report files.
- Fix inspector overflow measurements against the usable scrollport and show exact counts when element geometry is sampled.
- Add optional Chromium dark-mode and reduced-motion emulation in CLI checks/inspections, recorded in viewport evidence.

## 0.3.0 — 2026-10-11 (CLI alpha)

- Fixed false centering deviations caused by reserved vertical scrollbar width; horizontal overflow now checks the usable scrollport.
- Added a manual real-site smoke workflow and more meaningful contracts for Sense6 gallery, Arabic, and learn pages.
- Added horizontal-only `contained` checks for below-the-fold layout content.
- Added bounded element candidates for horizontal overflow and observed DOM evidence on failed rules.
- Added open Shadow DOM selector chains (`host >>> child`) and composed DOM paths.
- Added `same-size` and `size-range` geometry rules for responsive galleries and controls.
- Bounded the returned geometry for broad selectors while preserving full visible-element counts.
- Added startup diagnostics and an opt-in `--no-sandbox` flag for locked-down Linux test runners.
- Improved Chrome discovery by reusing browser binaries from existing Playwright/Puppeteer installations without depending on those libraries.
- Fixed `--fail-on-skip`: intentional viewport-range exclusions no longer fail CI.
- Added GitHub CI, architecture and contribution docs, and tests covering the new behavior (47 passing locally).

## 0.2.0 — 2026-10-11 (experimental)

- Added `compare` for like-for-like baseline/candidate layout regression checks.
- Added `validate` for offline contract parsing and improved strict unknown-field validation.
- Added optional SARIF output and screenshot evidence with DOM highlights.
- Added explicit actions to reach dynamic page states: click, fill, wait-for, pause, scroll-into-view.
- Added mobile touch and locale emulation options with observable viewport metadata.
- Improved responsive width sampling, transition refinement, and RTL logical edge handling.
- Added CLI integration tests and pure diagnostics tests (40 passing).
- Added specimen contracts for the personal site and Sense6; real-world CLI benchmark is pending.

## 0.1.0 — 2026-10-11 (prototype)

- Pure geometry and layout-contract core, Chromium CDP runner, JSON reporting, multiple viewport widths.

- Add optional CSS media-query breakpoint scanning to CLI `check`, `scan`, and `compare`.

- Give Chromium a separate minimum startup deadline on CI runners, preserving faster CDP operation timeouts.
