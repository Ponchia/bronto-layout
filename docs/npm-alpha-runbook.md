# npm beta prerelease runbook (manual and intentionally gated)

**Source-beta engineering is approved; registry publication still requires an authorized npm publisher.** Bronto Layout is already a public,
MIT-licensed GitHub repository, but the package `@ponchia/layout` has **not
been published to npm**. The exact source revision for `v0.5.0-beta.0` is available as a [GitHub prerelease](https://github.com/Ponchia/bronto-layout/releases/tag/v0.5.0-beta.0); this is **not** a promise of npm registry availability or stability.

This runbook exists to make registry publication repeatable. It contains
preflight commands, but **does not configure automatic npm publishing**.
The source-only GitHub prerelease was published after CI passed, with a reviewed tarball, SHA-256 checksum, commit SHA and limitations. It does **not** imply `@ponchia/layout` is available from npm.

## 1. Confirm the decision and release identity

The maintainer must explicitly approve an npm beta prerelease, identify the
intended registry account, and choose the exact prerelease version and
dist-tag. A package named `@ponchia/layout` requires publisher permission in
that npm scope; the package being absent from an unauthenticated search is
**not** proof that publishing permission exists.

The proposed beta identity is `0.5.0-beta.0` in both `package.json` and `package-lock.json`. Never assume that a source version or absent registry listing proves an npm package was published; confirm registry access, explicit beta dist-tag and a reviewed source commit before any write.

The 14 October 2026 server's `npm whoami` returned `ENEEDAUTH`. Only an authorized npm
publisher can complete this gate; do not store an npm token in the repo,
issues, logs, CLI arguments, or screenshots.

## 2. Local, nondestructive release preflight

From a **clean, reviewed revision of main**, with Node.js 22+:

```sh
git status --short --branch
npm ci
npm run check
npm run coverage:unit
npm run field:validate
npm run benchmark:audit
npm run benchmark:audit:locations
npm run test:package
npm pack --dry-run --json
```

The controlled browser benchmarks require supported Chromium and must use
only the repository's trusted fixtures. Run the full GitHub Actions Node 22/24
Chromium matrix and hosted macOS portability checks; the main branch must
match the commit you intend to release.

The repository's `test:package` suite constructs a tarball and installs it
into two **isolated offline consumer projects**, with lifecycle scripts both
disabled and enabled. Confirm public exports, editor schemas and CLI examples
are present and that private contributor-only scripts/tests and downloaded
field screenshots are **not** included.

Run a manual privacy review of the actual `npm pack --dry-run --json` file
list. Exclude tokens, personal documents, captured authenticated pages,
secrets, local environment files and oversized development artifacts.
The package must remain zero-runtime-dependency unless that contract is
deliberately changed and tested.

## 3. Product and platform review before distribution

Use the [public beta checklist](release-checklist.md). In particular:

- Obtain external first-time developer feedback using the
  [self-service trial](first-use-trial.md), without making up a reviewer.
- Independently review field captures and assign human-origin labels using
  the [field protocol](field-benchmark.md); synthetic regression fixtures
  and screenshot hashes alone cannot establish real-world accuracy.
- Verify browser launch and packaged CLI behavior on a **physical macOS
  machine**; hosted macOS runners are useful evidence, not a substitute.
- Document unsupported iframe interiors, closed shadow roots, custom paint,
  imperfect automatic heuristics and Chromium-only runtime support.

A maintainer can explicitly choose an early beta despite pending
real-world quality research, but then release notes must state what remains
unknown and should not call the package production-ready.

## 4. Configure publishing only after explicit approval

Prefer npm's supported trusted publishing/CI identity mechanism, with
publisher-side permission configuration, an audited source commit, and
restrictive workflow permissions. Use a separate protected release
environment. Confirm current npm documentation before configuring the
exact identity/provenance mechanism; do not assume GitHub credentials grant
access to an npm scope.

Until those settings exist, no GitHub workflow should publish from a
general PR, an ordinary push to main, or a Dependabot change.

The responsible maintainer should independently confirm the requested
version is absent from the registry, set the agreed prerelease dist-tag,
review the tarball one last time and **explicitly authorize** the final
registry write. Treat the registry upload as an irreversible external
publication, not as another CI test.

## 5. Verify the registry release before claiming npm availability

After authorized publication, verify that a clean consumer can install the
**exact published version** and run `doctor`, `validate`, the healthy
portfolio check and the intentionally failing one on Linux and macOS.
Check registry metadata, package integrity, provenance if configured,
expected CLI binary/exports, and the intended beta dist-tag. Update any
GitHub prerelease notes only after verifying the npm package against the
same source identity; do not repoint an existing tag or imply npm publication
from a GitHub tarball alone.

Do not announce general visual correctness, cross-browser compatibility,
WCAG conformance or real-world precision/recall unless those have been
independently established. A failed publish should be investigated before
retrying; never blindly republish a different artifact under the same
claimed version.

**Current release state:** public repository and source checkout available;
npm publication, publisher authorization, external usability review,
human-labeled field accuracy and physical Mac verification remain pending.
