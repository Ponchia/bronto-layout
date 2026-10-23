# In-house beta validation

Lifecycle: current

The beta is qualified through reproducible engineering checks. No outside
developer, recruitment exercise or independent human label is required to ship.
This does not turn internal evidence into a claim about public adoption or
real-world detector accuracy.

## First use from the installed package

`npm run test:package` creates two isolated consumers of the built archive:
ordinary installation and an installation with lifecycle scripts disabled.
Both use the compiled package, public API, executable and shipped examples,
not imports from the source checkout. The hosted Node 22/24 gates also exercise
real Chromium from the installed package.

For the public registry release, `verify-registry` installs the exact version,
checks signatures and validates its exports and example contract. A read-only
verifier compares the downloaded registry bytes with the qualified archive.
These are repeatable first-use checks, not a timed usability study.

## Expected results and counterexamples

| Boundary | Expected control |
| --- | --- |
| Layout intent | Deliberate displacement fails its alignment rule. |
| Selector identity | Multiple matches cannot become a singleton pass. |
| Measurement | Counted but missing geometry remains unverified. |
| Comparison | Unavailable measurements do not establish no regression. |
| Applicable rules | All excluded widths produce exit 2. |
| Interaction | Ambiguous mutation fails before acting. |
| Browser startup | Handshake and disconnect obey the time budget. |
| Input protection | Reports cannot overwrite input file aliases. |
| Registry | Wrong identity, bytes, or beta tag fail verification. |

Keep controlled fixture results separate from the existing first-party consumer
contracts and historical source-built studies. Both are useful; neither supplies
independent human labels or a universal precision/recall estimate.

## Routine checks

```sh
npm ci --ignore-scripts
npm run check
npm run coverage:unit
npm run test:package
npm run field:validate
```

Run the complete hosted Node 22/24 Chromium and macOS workflows before merging
a release candidate. Preserve their tests, coverage and sandboxed startup check.
The optional local unit subset is for fast iteration, not release qualification.
When a restricted host cannot launch sandboxed Chrome, report the limitation.
Only trusted self-contained test fixtures may use the documented explicit test
override; do not apply it to public or authenticated sites.

## Publication claims

A merged candidate, accepted npm upload, verified registry package and GitHub
release are separate states. Record each with its exact version and source.
The [active release checklist](release-checklist.md) governs that sequence.
Do not claim better rankings, adoption, physical-device behavior or a speed gain
from these tests. No telemetry or unsolicited external contact is introduced.
