# Public alpha gate (v0.4 candidate; no publication authorized)

See the [manual npm alpha runbook](npm-alpha-runbook.md) for safe registry preflight and verification.

This is a release-preparation checklist, **not** a claim of production readiness. `@ponchia/layout` has not been published to npm. Publication, a tag, version bump and public release announcement are separate decisions.

## Public repository and first-run readiness (13 October 2026)

- [x] Repository itself is already public and MIT-licensed; **public repo visibility does not imply an npm release**.
- [x] Replace oversized root README with a short CLI/contract demonstration, move older extended material into `docs/cli-reference.md`, preserve detailed docs.
- [x] Include a realistic *controlled* portfolio alignment regression with baseline, intentional 18px failure, responsive contract, walkthrough and Chromium test.
- [x] Add `SECURITY.md`, reproducible bug/feature issue forms, PR review checklist and safe contribution guidelines; enable GitHub private vulnerability reports.
- [x] Provide a GitHub funding link with optional Ko-fi support, CI/License status badges, and guard against standalone incompatible TypeScript and ESLint major dependency updates while retaining patch/minor Dependabot checks.
- [x] Run four first-party route contracts and four-width audits on a disposable Actions runner: 80/80 contract evaluations passed, zero confirmed measured audit findings; **known omitted optional candidates** on both Sense6 locales ([run](https://github.com/Ponchia/bronto-layout/actions/runs/38345314679)).
- [x] Recapture the 30-state first-party cohort on a disposable Actions runner, **30 captures complete** with six Chiara embedded-frame coverage warnings and no independent human labels ([run](https://github.com/Ponchia/bronto-layout/actions/runs/38345316815)).
- [x] Prepare a privacy-conscious [self-service first-use trial](first-use-trial.md) and [feedback issue form](../.github/ISSUE_TEMPLATE/first-use.yml) for external developers; these do not create human field labels.
- [ ] Obtain a first-time *external* user trying the new README on a non-first-party local site; record confusion/commands needed without collecting private browsing evidence.
- [ ] Independently label additional real defects outside the first-party cohort (including prior version regressions and intentional negative controls).
- [x] Capture the separate v0.2 cohort (42/42 captured and 84/84 artifact hashes verified in [run 38348760404](https://github.com/Ponchia/bronto-layout/actions/runs/38348760404)); preserve the historical v0.1 cohort. **Independent inspection and labels are still pending**.
- [x] Fix and recheck the 320px BrontoUI homepage overflow on the **deployed** site ([BrontoUI #248](https://github.com/Ponchia/bronto-ui/issues/248), [six-width capture 38353800504](https://github.com/Ponchia/bronto-layout/actions/runs/38353800504), [six-route smoke 38353798145](https://github.com/Ponchia/bronto-layout/actions/runs/38353798145)). All 136 approved contract evaluations passed after deployment; this does not replace field accuracy labels.
- [x] Validate a [real first-party downstream CI consumer](real-consumer-brontoui.md): **159/159 approved responsive evaluations** across three built website documents, plus separately detected 3px overflow and 8px alignment mutations. The consuming [BrontoUI CI gate](https://github.com/Ponchia/bronto-ui/pull/255) is now required for application changes and precedes Pages deployment. This is not independent adoption or field accuracy.
- [ ] Ensure the proposed public package name belongs to an authorized npm publisher. An unauthenticated npm registry lookup for `@ponchia/layout` returned 404, which is **not** confirmation of publisher permissions.

## Repeatable technical gates

- [ ] Independently verify the two-shard Node 22/24 browser CI partition
  preserves every test and passes both shards with the normal package and
  controlled-benchmark gates. Compare repeated GitHub run durations to the
  original serial baseline before claiming a speed improvement.

- [x] Dependency-free Node CLI uses installed Chromium/CDP rather than bundling a browser.
- [x] Verify copied/relocated paired viewport screenshots through a bounded offline `verify-evidence` command, using recorded SHA-256 hashes and exact local filenames. A copied comparison report still needs a trusted origin; this does not verify design quality.
- [x] Opt-in baseline/candidate viewport screenshots have SHA-256 metadata and never overwrite prior reviewer evidence. The screenshot directory also gets a static offline comparison gallery with CSP-blocked scripts and network access. These do not establish visual intent or human ground truth.
- [x] Validate the generated tarball in two isolated offline consumer npm installations: lifecycle scripts deliberately disabled and standard install behavior enabled (`npm run test:package`). Verify the installed CLI/public API and absence of source-only benchmark tooling.
- [x] Add ESLint static checks across TypeScript, Node CLI, scripts and tests, plus a portable-core coverage floor in Node 24 CI. These are code-maintenance gates, not production detector accuracy.
- [x] Include versioned JSON Schema editor assistance for contracts, finite batch manifests and standalone declarative action arrays in the offline npm package, tested against the TypeScript parsers and real examples. CLI validation remains authoritative for alias/semantic checks.

- [x] Capture only observed browser facts and preserve distinct review warnings / accepted rules; verified versus supported-scope measured booleans are separated for known iframe gaps.
- [x] Disclose bounded, opt-in grid/flex review **candidate omissions** separately from completed DOM/frame coverage, including compact first-party smoke reports. No omission count is interpreted as a confirmed visual defect or a clean result.

- [x] Detect meaningful growth/shrinkage of existing text-clipping and opt-in grid-spacing review leads by measured CSS-pixel magnitude. Keep human-review changes nonblocking and incomplete measurements unverified.
- [x] Add bounded, opt-in CSS Flex/Grid sibling-overlap **review leads** with intentional-overlay suppressions, element location evidence, stateful replay tests, and explicit uncertainty for omitted candidate containers; no strict or field-accuracy claims.


- [x] Reproduce explicit UI states for *zero-contract* audits and automatic baseline/candidate comparisons with bounded, reviewed declarative actions, no arbitrary JavaScript, and no action values in reports.
- [x] Support explicitly bounded, configurable automatic-audit DOM traversal while defaulting to 18,000 inspected elements. Test 20,000-element truncation and opt-in expanded traversal at 25,000 without claiming visual design completeness.
- [x] Preserve approved scenario flags and interactions for reproducible contract checks. `review-draft` rechecks unapproved relationships on later page revisions and marks unknown geometry explicitly.
- [x] Uniform open-Shadow DOM selector resolution for measurement, readiness and actions.
- [x] Expose known iframe coverage gaps, with explicit strict-coverage option. Optional DOMSnapshot frame-document inventory provides bounded evidence without claiming inner-frame correctness.
- [x] Provide `doctor`, a bounded parallel batch option and `npm run test:unit` for first-time contributors.
- [x] Allow explicitly declared zero-contract `audit` jobs in versioned finite batch manifests without changing legacy contract-check defaults, test isolated state replay and preserve separate automated diagnostic vs contract assertion counts.
- [x] Add an opt-in `doctor --verify-launch` that exercises an isolated local Chromium/CDP session instead of assuming `chrome --version` proves startup. Test successful and unsuccessful launches, disclosing explicit sandbox bypass; **physical Mac verification remains pending**.
- [x] Verify the macOS packaging/conditional Chromium smoke workflow passes on a hosted macOS runner (PR #34 and main `58ebc70`; conditional runner smoke is not independent physical-device proof).
- [x] Verify full Node 22/24 CI on merged `main` (run `38245817139`, `58ebc70`, success).
- [ ] Obtain third-party review of platform behavior on a physical macOS machine, including sandboxed Chromium startup (CI is not a substitute).
- [x] Provide a repeatable, offline 16-job mixed-state and 500/5,000/20,000-element local-fixture stress profiler (`npm run profile:stress`). Synthetic stress includes an explicit incomplete-coverage control and must not be presented as production detector quality.
- [ ] Run those performance tests on an *idle/stable* reference host with repeated trials and recorded hardware/browser environment before publishing representative speed claims.
- [ ] Inspect license headers, generated package content, repo metadata, and registry name availability before publication.

## Independent quality evidence

- [x] Build the [pinned Eleventy OSS source site](oss-source-built-study.md) on a disposable runner ([run 38425982845](https://github.com/Ponchia/bronto-layout/actions/runs/38425982845)): **88/88 responsive checks**, one induced **18px semantic alignment failure**, and **0 generic audit issues**; all four initial JSON report hashes verified. This is mechanical, not human-labeled accuracy.
- [x] Capture and inspect Eleventy's **8 baseline and 2 mutation screenshots** with a verified, portable evidence index in [run 38427558662](https://github.com/Ponchia/bronto-layout/actions/runs/38427558662). All artifact SHA-256 checks passed and the 18px alignment displacement is visible. This is a first-party reviewer inspection, **not independent human accuracy labeling**.

- [x] Complete the [fixed external deep-scroll study](oss-scroll-state-study.md) against Vite and Docusaurus: **4/4 verified scroll states**, **12/12 responsive contract evaluations**, and **13/13 portable artifact hashes** in [run 38415585449](https://github.com/Ponchia/bronto-layout/actions/runs/38415585449). The previous Vite 10px clipped-root width observation remains, without a claim of user-visible overflow or independent whole-page correctness.
- [x] Run the [fixed open-source mobile-navigation state cohort](oss-mobile-state-study.md) in sandboxed Chrome: **5/5 opened states**, **15/15 passing explicit assertions**, **0 measured errors**, and 21/21 evidence hashes verified in [run 38383862119](https://github.com/Ponchia/bronto-layout/actions/runs/38383862119). This is automated state validation, not independently human-labelled design quality.
- [ ] Obtain independent human usability/keyboard review of the opened menus; the current DOM-state and viewport checks cannot certify focus order or touch ergonomics.
- [ ] Re-run fixed, independently maintained mobile-menu cases with opt-in `pointer-click` browser hit testing before claiming mouse reachability; prior `click`-only results proved DOM-handler state, not physical clickability.

- [x] Controlled labeled fixture benchmark (33 cases as of the initial v0.4 candidate) and element-location assertions.
- [x] 30 first-party URL/viewport captures from the manual workflow, with SHA-256 integrity checks. No human labels yet.
- [x] `review-packet` command generates an independent worksheet, never auto-populating labels. `review-gallery` provides a static, hash-verified visual contact sheet with no predictions, included in manual field artifacts.
- [x] Provide a blank `review-label-template` with pending case IDs, safe progress tracking, and scorer exclusion of pending records. No human labels or accuracy claims are generated.
- [x] Validate human-review attestation dates as actual ISO calendar days, including leap years, rather than trusting `Date.parse` rollover. Reviewer identity and actual inspection remain external human judgments.
- [x] Offer an optional offline CSP-locked human review console for editing/exporting explicit labels; preserve the existing no-script gallery. Real Chromium verifies browser downloads and imports, but no human field labels have been collected.

- [x] Optional bounded below-the-fold screenshots with digest verification and explicit truncation; original initial-viewport-only captures remain valid, and independent human labels are still required.
- [ ] An independent reviewer labels all 30 captured states (including below-fold and relevant interactive content). Frame-bearing pages are excluded from whole-page accuracy scoring until their interiors can be verified.
- [ ] Expand to independently verified positive and negative examples outside the current first-party cohort.
- [ ] Report per-detector precision, recall, localization accuracy and unknown/partial coverage on that labeled dataset; no claim of superiority to Snug, Galen or Polypane without the same cases.

Keep screenshot artifacts private where appropriate; the existing Actions capture artifacts expire after seven days. Do not commit screenshots from authenticated/private pages. See [field benchmark](field-benchmark.md) and [issue #27](https://github.com/Ponchia/bronto-layout/issues/27).

## Release operations (intentionally pending)

- [ ] Independently review the release diff and close any release-blocking defects.
- [ ] Decide on the public alpha version and changelog contents.
- [ ] Verify npm package naming and publisher permissions in the registry.
- [ ] Explicitly authorize and perform npm publishing, then verify install/doctor/audit from the public registry on Linux and macOS.
- [ ] Tag the published commit and publish release notes with non-goals and known limitations.

Do not switch the website/README to "production-ready" merely because CI passes.
