# Changelog

## Unreleased

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
