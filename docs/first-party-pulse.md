# Weekly first-party layout pulse

Bronto Layout is an engineering instrument, not a hosted analytics product. This
[workflow](../.github/workflows/first-party-layout-pulse.yml) runs **weekly on
Monday at 06:23 UTC** (or on manual dispatch) against the six *already declared,
public, first-party* site contracts in `examples/`. It rejects unexpected contract fields, including declarative `actions`
and `scenario`, rather than silently granting browser interaction authority. It
never accepts arbitrary URLs, account credentials or authenticated sessions. It does
not run on pull requests or block ordinary library releases.

The source-pinned CLI is installed with `npm ci`, compiled in the disposable
runner, then required to launch sandboxed Chromium before contacting a page.
Each contract samples its four coarse widths plus **one interior width per
interval** (seven widths per site; 42 total), checks unavailable measurements
strictly, and preserves observed skips separately. A clean outcome never means
that every width, iframe, application state or drawn pixel is correct.

Run `node scripts/first-party-pulse.mjs --plan` locally to inspect and validate
the fixed cohort without opening any website. The `--run` mode is for a runner
with **working Chromium sandboxing**; it intentionally refuses
`BRONTO_CHROME_NO_SANDBOX=1`. The deployed sites are mutable; failed contracts
may reflect content changes, external outages or an actual layout regression.
Review the affected route and intended rule before changing CSS. Do not
silence a failing rule, automatically approve new constraints, or infer the
source-level fix from geometric evidence alone.

The Action summary and its 30-day artifact contain **only** fixed site IDs,
exit classification, numeric counts, sampled-width coverage, approved failing
rule IDs, bounded CSS-pixel deviations and run duration. Raw CLI reports (which can contain DOM paths,
content, CSS and URLs), screenshots and stderr are discarded inside the
runner. Unverified responses are failures to measure, **not** clean layouts.
Artifact retention is for comparing first-party trends, not computing
independent detector precision/recall. Human review labels are still pending;
use the [field-review protocol](field-benchmark.md) for that work. No marketing,
no npm registry access, no automatic CSS repair and no external dashboards are
involved.
