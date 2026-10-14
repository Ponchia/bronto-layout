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

## First observed run — 14 October 2026

The initial [manual run #38632220615](https://github.com/Ponchia/bronto-layout/actions/runs/38632220615) ran on `main` source commit `024f6990c090bee6d9325f679e314aaa82701918`. It completed **6/6 public routes and 238/238 reviewed contract assertions**, without failed, skipped or unverified assertions. All 42 planned viewport samples were observed; the aggregate browser-check duration was **44.331 seconds**. Every route still had a **255px largest unmeasured interval** between probes, so this is an observed baseline—not a whole-design certification or independent human label.

| Owned public route | Observed widths | Passed assertions | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| Personal website | 7 | 28 | 0 | 0 |
| Sense6 English gallery | 7 | 42 | 0 | 0 |
| Sense6 Arabic gallery | 7 | 35 | 0 | 0 |
| Sense6 Learn | 7 | 35 | 0 | 0 |
| BrontoUI home | 7 | 49 | 0 | 0 |
| BrontoUI operations | 7 | 49 | 0 | 0 |

The GitHub artifact was downloaded and independently inspected: it contained **only one sanitized JSON file** (`bronto-first-party-pulse-summary.json`, 2,136 bytes), not the raw browser reports, CSS/DOM evidence, URLs or screenshots. The workflow's run summary is the ongoing source of truth; these fixed observations are retained here so the first baseline remains auditable after the GitHub artifact's 30-day expiry.

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
