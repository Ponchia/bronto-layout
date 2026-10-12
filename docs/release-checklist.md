# Public alpha gate (v0.4 candidate; no publication authorized)

This is a release-preparation checklist, **not** a claim of production readiness. `@ponchia/layout` has not been published to npm. Publication, a tag, version bump and public release announcement are separate decisions.

## Repeatable technical gates

- [x] Dependency-free Node CLI uses installed Chromium/CDP rather than bundling a browser.
- [x] Verify copied/relocated paired viewport screenshots through a bounded offline `verify-evidence` command, using recorded SHA-256 hashes and exact local filenames. A copied comparison report still needs a trusted origin; this does not verify design quality.
- [x] Opt-in baseline/candidate viewport screenshots have SHA-256 metadata and never overwrite prior reviewer evidence. The screenshot directory also gets a static offline comparison gallery with CSP-blocked scripts and network access. These do not establish visual intent or human ground truth.
- [x] Validate the generated tarball in two isolated offline consumer npm installations: lifecycle scripts deliberately disabled and standard install behavior enabled (`npm run test:package`). Verify the installed CLI/public API and absence of source-only benchmark tooling.
- [x] Add ESLint static checks across TypeScript, Node CLI, scripts and tests, plus a portable-core coverage floor in Node 24 CI. These are code-maintenance gates, not production detector accuracy.
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
