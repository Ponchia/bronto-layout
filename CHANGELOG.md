# Changelog

## Unreleased

- Add a controlled historical OSS flexbox-minimum-size regression informed
  by the independently fixed Svelte playground mobile switch (#548).
  Existing explicit viewport containment detects a 58px obscured switch
  while both selector existence and generic horizontal audit remain green.
  Document the recreation's limits instead of claiming an upstream replay.

- Complete a successful pinned, independently authored Eleventy source-build
  study (88/88 baseline responsive assertions, 18px deliberate semantic
  misalignment caught with zero generic overflow findings), and add a
  reproducible screenshot-evidence verifier after the original JSON-only
  artifact exposed missing healthy screenshots. The follow-up hosted
  Chromium run captured 8 baseline and 2 mutation screenshots with a
  verified portable index and 23/23 valid file hashes; image inspection
  confirms the deliberately displaced content without implying visual
  correctness or human-assigned accuracy labels.

- Verify fixed deep-scroll OSS states in a sandboxed Chrome run: four
  Docusaurus/Vite mobile and desktop heading checks, 12/12 passing
  assertions, 4,296–12,055 CSS px offsets and 13/13 portable checksums.
  The known Vite clipped-root width finding remains separately reported.
- Confirm five-site mobile-menu artifacts verify directly after download
  (21/21 SHA-256 hashes, all 15 menu-state assertions passing).

- First five-site external mobile-navigation run passed **15/15** post-click
  DOM-state assertions with zero measured audit issues. Preserve the two
  nonblocking Astro pending-image warnings and separate human usability
  review from browser-state success. Improve temporary capture checksums
  to use portable artifact-relative paths, independently verified on upload.

- Add a manual five-route external OSS mobile-menu study: fixed public URLs, click-only state setup, sandboxed Chrome, explicit post-click assertions and temporary screenshots. Experimental state coverage, not independent accuracy proof.

- Prioritize observed root-overflow candidates on the inline-end side
  (LTR right; RTL left) so a closed offscreen drawer cannot outrank a small
  body-width excess. Controlled Chromium tests cover LTR and RTL; a third
  external 20-state docs capture (40/40 hashes verified) confirmed that
  Vite now lists 10px inline-end candidates ahead of its hidden mobile
  sidebar, retaining numeric document overflow/strict exits.
- The second independent OSS capture (24/24 states, 48/48 hashes verified)
  eliminated four Vite skip-link review false leads while retaining the
  measured 10px clipped-root extent; Excalidraw now shows two CSS-visible
  uninspected canvases at every tested width.

- Introduce a separate manual 24-state open-source website cohort (Astro EN/ES, Docusaurus, Vite, Svelte, Excalidraw) with sandboxed Chrome, strict host allowlists and human review. No accuracy claims follow from capture success alone.

- Prefer installed stable Chrome before optional development Chromium in
  automatic Linux browser selection. Preserve explicit command-line and
  CHROME_PATH overrides, do not retry with no-sandbox, and test selection
  independently of the host's installed browser. Motivated by a real
  GitHub Actions consumer where stable Chrome launched securely but the
  auto-selected development Chromium aborted at startup.
  The Node 22 CI matrix now exercises default browser launch without any
  sandbox bypass and checks selection of stable Chrome when both are present.
- Document the first downstream BrontoUI integration through its required deployment gate: 159/159 passing responsive contract evaluations on three website documents, a detected 3px mobile overflow and a detected 8px dashboard misalignment that a generic audit misses. These are first-party browser observations, not independently labeled accuracy.

- Add a manual npm alpha-release runbook covering publisher authorization, reviewed SemVer prereleases, isolated package verification, privacy checks and registry validation. No publishing workflow, tag, or package release is created automatically.

- Record published BrontoUI fix verification: six responsive captures with no measured root overflow, and 136/136 approved layout checks passing across six first-party routes; field labels and unsupported iframe interiors remain pending.
- Experiment with deterministic two-way CI test partitions on separate
  GitHub runners for Node 22 and 24. Retain every full-suite test file,
  browser fixture isolation, core coverage, package-consumer smoke and
  controlled audit benchmark gates; local `npm run check` still runs all
  tests. Two passing GitHub CI runs verified the distribution, including
  moving the v0.3 localization benchmark to the second Node 24 shard.
  The longest final Node 24 job took 5m09s compared with 9m41s in the
  previous serial CI; job scheduling can vary on different runners.

- Add a versioned 42-state first-party validation cohort (preserving all historical v0.1 cases), BrontoUI documentation/operations layout contracts and opt-in allowlisted GitHub Actions smoke/capture coverage. Embedded-demo iframe content remains explicitly unverified; this is coverage expansion, not independent accuracy evidence. The first v0.2 run captured all 42 states and exposed a measured 3px document overflow on the published BrontoUI homepage at 320px, tracked in BrontoUI issue #248.
- Keep actual page overflow detection strict while excluding diagnostic
  element candidates fully clipped by their own viewport-contained horizontal
  scrolling/clipping ancestor. Preserve open-shadow traversal and add
  controlled Chromium fixtures proving an oversized code line is not blamed
  for an independent narrow-screen heading overflow; no automatic CSS
  diagnosis or real-world accuracy claim is introduced.

- Prepare public-repository onboarding: replace the oversized README with a concise reproduction-first guide, preserve extended CLI information in `docs/cli-reference.md`, add a controlled portfolio alignment regression and four browser tests plus a real annotated fixture screenshot, and document the multi-site first-party validation run separately from independent real-world accuracy.
- Add responsible vulnerability disclosure guidance, enable private vulnerability reporting and add bounded weekly Dependabot checks, structured safe reproduction issue templates and a PR checklist; update contribution advice to prioritize confirmed false negatives/positives without sensitive browser evidence.


- Ship JSON Schema Draft 2020-12 editor hints for v1 contracts, bounded batch manifests and standalone declarative action files, with optional non-fetching `$schema` metadata, schema-enabled examples, parser/schema parity tests and npm package exports. Runtime aliases, cross-field constraints and actual browser behavior remain validated by the CLI.

- Add offline `bronto-layout verify-evidence --comparison FILE --evidence-dir DIR` to recheck relocated baseline/candidate screenshot SHA-256 digests, PNG headers and strict file provenance without browser/network access, rejecting missing, tampered or symlinked review artifacts. Verification never infers visual correctness; comparison input is protected against CLI output overwrites.
- Expose opt-in `grid_gap_review` and `sibling_overlap_review` switches in the manual, allowlisted first-party live-site workflow. Capture review-only warning summaries in retained CLI reports/logs without changing default audits, blocking PR CI, accepting arbitrary URLs or inventing human labels.

- Extend finite `batch` manifests with explicit `mode: "audit"` URL jobs alongside existing contract checks (still the default); prevalidate action files, retain isolated Chromium processes and mixed 0/1/2 exit semantics, and keep measured mechanical issues and nonblocking review warnings distinct from approved contract assertions.

- Include `audit-comparison.html`, a script-free local side-by-side viewport gallery for opt-in paired audit evidence, with source-hashed CSP styles, strictly validated local PNG references and SHA-256 provenance labels. No remote content, automated visual diff or generated human annotations; test actual image rendering in Chromium.



- Add opt-in `audit --baseline OLD --url NEW --evidence-dir DIR` to save viewport-only baseline/candidate PNG pairs after equivalent browser-state replay at each responsive width. Full and compact JSON carry SHA-256 provenance and file paths. Existing reviewer images are never silently overwritten, and screenshots are for visual inspection only, not automatic pixel-diff or independently labeled accuracy. Full-page paired images remain unsupported.

- Move finite `batch` manifest planning and isolated subprocess execution out of the shared CLI into `bin/batch-command.mjs`. Preserve bounded 1–4-way parallelism, manifest ordering and exit-code semantics; the child process path stays anchored to the installed CLI rather than the extracted module. Add browser-free plan tests and package-distribution coverage. No API or runtime dependency changes.



- Extract zero-contract audit and before/after audit orchestration from the growing CLI into `bin/audit-command.mjs`, keeping browser lifecycle and shared scenario parsing in their existing modules. Preserve report/exit-code behavior, privacy-safe action summaries, coverage/iframe evidence and opt-in review leads; test the installed package includes the new module. No added runtime dependencies or automatic verdicts.


- Tighten independent human-review label validation: `reviewedAt` must be a *real* ISO `YYYY-MM-DD` calendar date. Node's `Date.parse` silently normalizes impossible dates such as 2026-02-30; these are now refused for both `reviewed` and `unreviewable` declarations, while valid leap days remain supported. This validates record structure only, not the authenticity of human review.
- Add opt-in `audit --sibling-overlap-review`, a bounded Flex/Grid direct-sibling rectangle intersection analyzer that skips common intentional overlap patterns. Findings include both child paths, are always nonblocking review warnings, and support conservative before/after review changes without inventing CSS causes or real-world accuracy claims.

- Add opt-in `doctor --verify-launch` to open and close a temporary blank Chromium/CDP session rather than assuming executable detection proves startup. Explicit sandbox bypass remains separately disclosed, and no external site is opened; default version-only doctor behavior is unchanged.

- Harden the offline npm tarball release gate with a second independent **ordinary** installation (lifecycle scripts enabled), exercising the CLI version, contract validation and public TypeScript API without source dependencies. Clarify that independent field-review scripts and benchmark manifests require a source checkout and are deliberately omitted from the installable CLI tarball.

- Prevent data loss when importing a partial independent-review JSON draft: validate all incoming records before applying any, replace only named cases and preserve in-progress controls for every omitted case. Browser regression tests verify the merged export remains schema-valid, including the complete 30-state field capture.

- Compare the measured magnitude of persistent, same-path **review-only** text-clipping and experimental grid-gap leads between baseline and candidate. Report `review-worsened` / `review-improved` with original and candidate CSS-pixel values above a 2px jitter floor, never a strict measured regression. Missing numeric evidence is unverified rather than silently unchanged.

- Add opt-in offline `field-benchmark review-console` for independent human review of hash-verified screenshots. A source-hash CSP protects local JavaScript for explicitly choosing statuses, validating attestations, and importing/exporting label JSON; no audit predictions, invented negative labels, uploads or persistent browser storage. Keep the original script-free gallery unchanged; manual capture artifacts provide both.


- Add opt-in `audit --grid-gap-review` for bounded, review-only CSS grid direct-child spacing anomalies, with observed declared/actual gaps, explicit incomplete-container reporting, and no automatic blocking or field-accuracy claim. Healthy and intentional `space-between` grids remain clean; a 12px transformed card produces a nonblocking review lead.
- Expose `audit --dom-limit N` (1,000–50,000, default 18,000) for complex DOM pages. The existing safety cap remains the default; explicit larger budgets preserve measured traversal/coverage in compact reports and can certify only that supported DOM traversal completed, not design correctness or hidden iframe contents.



- Support declarative `audit --actions FILE` and automatic `audit --baseline ... --actions FILE` to replay user-selected UI states independently at every width, including media-query threshold scans. This exposes previously hidden overflow and failed images after opening panels; reports preserve action type/count provenance without leaking filled values. Missing selectors and malformed actions fail closed; no automatic authentication or arbitrary JS.

- Separate strict CLI parsing, command-option validation, numeric viewport parsing and approved browser scenario precedence into browser-free `bin/cli-options.mjs`. Keep the same commands/exit behavior, add direct pure tests and require the new module in isolated npm installs.
- Add opt-in 16-route cold CLI stress profiling with a trusted local-only mixed-state batch and synthetic 500/5,000/20,000-element DOM fixtures. Measure repeatable wall-clock times while preserving expected failing contracts and explicit audit traversal truncation; no performance or accuracy claims for production pages.


- Improve the human-readable CLI contract workflow: proposals include exact next commands and selector discovery limits, draft reviews show per-viewport deviations/tolerances with correct units, and approval output shows validation/check commands. Add a self-contained 12px gallery regression walkthrough and focused tests. No proposal gains automatic approval or new blocking behavior.
- Add `field-benchmark review-label-template` and `review-progress` for blinded independent human review. Pending statuses are explicitly unscored, human attestations are validated, and missing/tampered evidence is reported separately. Manual first-party capture artifacts ship the blank draft without detector predictions; existing human review remains unperformed.

- Introduce ESLint 9 + recommended TypeScript linting as development-only dependencies; `npm run check` now enforces lint along with compilation/integration tests. Add built-in Node/V8 unit coverage thresholds for the portable core (90% lines, 85% branches, 80% functions), wired into CI. Remove stale unused helper variables/imports.
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
