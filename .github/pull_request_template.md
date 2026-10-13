## Purpose

Describe the real layout verification problem this PR solves, its non-goals, and any observed behavior change.

## Verification

- [ ] New/changed rules include a passing and failing fixture, and tests across relevant widths/states.
- [ ] `npm run test:unit` and `npm run check` (on a machine with supported Chromium) pass, or missing evidence is disclosed.
- [ ] `npm run test:package` passes when changing published CLI/types/schemas.
- [ ] The README, reference docs and changelog are updated where user-visible behavior changes.
- [ ] Any sampled or unknown browser surfaces are disclosed; review-only leads aren't promoted to confirmed errors.
- [ ] No credentials, authenticated screenshots, private URLs or unsafe browser sandbox bypass were committed.

## Evidence

Link reproducible reports/CI runs (omit sensitive evidence) and explain independent real-site verification separately from controlled fixture results.
