# Beta qualification and release gates

Lifecycle: current

This is the active release checklist. The [October 14 record](archive/release-checklist-2026-10-14.md)
preserves historical checks and uncompleted research; it is not the current gate.
A public beta is qualified by reproducible in-house engineering evidence.
External-developer recruitment, independent human labeling and physical-device
studies are **not prerequisites for the beta**. Their absence limits adoption,
usability and real-world accuracy claims. Do not invent that evidence.

## Qualify the candidate

- Review the diff against current main and preserve unrelated worktrees.
- Pass the complete Node 22/24 Chromium matrix and macOS hosted-runner checks.
  Require the existing coverage, controlled benchmark and package-consumer gates.
- Exercise a clean installed archive, outside its source checkout, with ordinary
  installation and install scripts disabled. Check public API exports and CLI
  behavior, not only compilation.
- Confirm a healthy layout passes and a deliberate relationship regression fails.
  Keep unsupported or unmeasured surfaces separate from successful checks.
- Preserve sandboxed browser preflight. Explicit sandbox overrides are limited
  to trusted self-contained fixtures in restricted test environments.
- Validate the relevant first-party consumer contracts and negative controls.
  Controlled mutations demonstrate those cases, not general precision/recall.
- Record the exact tested source, version, archive checksum and known limits.
  Do not publish representative performance claims from a busy shared host.

## Publish and verify

Follow the [publishing protocol](npm-publishing.md). Publishing is an explicitly
authorized operation, not a consequence of a green pull request.

1. Merge only after exact-head gates pass. Choose a new, unused beta version;
   never rebuild different bytes under an existing published version.
2. For a first publication, use the authenticated maintainer and normal npm 2FA.
   Do not disable 2FA or make broad long-lived tokens to avoid an approval.
3. Configure the exact trusted publisher after the package exists; later
   releases use the protected `npm-publish` environment and `beta` dist-tag.
4. Verify registry identity, integrity, downloaded archive equality and the
   `beta` tag. A nonempty response file or accepted publish is insufficient.
5. Install that exact public version in a clean consumer. Verify its CLI,
   public exports and npm registry signatures. OIDC releases additionally
   require provenance; a local bootstrap must not claim OIDC provenance.
6. Publish GitHub release assets only after registry verification succeeds.
   Keep their bytes identical and leave stable `latest` unchanged.

On a post-publication verification failure, publication state may already be
committed. Retry **read-only verification**, not `npm publish`. Preserve the
original archive, version, job and receipt while diagnosing the failure.

## Evidence that remains outside these gates

Independent adoption, human-scored detector accuracy, broad cross-browser
support, physical-device usability and stable performance benchmarks remain
unestablished unless separately measured. Keep existing evidence and research
issues for reference; no outside developer is assigned work by this checklist.
