# Changelog

## 0.3.0 — 2026-10-11 (CLI alpha)

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
