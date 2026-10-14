# Bronto Layout beta — integrating in real projects and agent workflows

**Status:** [v0.5.0-beta.0 is published as a GitHub prerelease](https://github.com/Ponchia/bronto-layout/releases/tag/v0.5.0-beta.0) with a checksum-verified tarball and pinned source. **It is not published to npm**: npm registry access and an authorized `beta` dist-tag remain separate. This is not an independent quality/accuracy certification.

The intended workflow is: **observe → specify intentional relationships → check a change → inspect evidence → revise**. A zero-contract audit can detect some mechanical problems, but cannot infer the intended spacing, alignment, art direction, stacking or usability of a design.

## Install the published GitHub beta (no npm registry package needed)

This exact GitHub tarball was downloaded and checked against its release SHA-256 on 14 October 2026, then installed in an isolated consumer without source dependencies. To repeat that installation locally, with Node.js 22+ and an installed Chrome/Chromium:

```sh
mkdir bronto-layout-beta && cd bronto-layout-beta
curl -fL --retry 3 -O https://github.com/Ponchia/bronto-layout/releases/download/v0.5.0-beta.0/ponchia-layout-0.5.0-beta.0.tgz
curl -fL --retry 3 -O https://github.com/Ponchia/bronto-layout/releases/download/v0.5.0-beta.0/SHA256SUMS.txt
shasum -a 256 -c SHA256SUMS.txt
npm install --ignore-scripts --no-audit --no-fund --prefix ./consumer ./ponchia-layout-0.5.0-beta.0.tgz
./consumer/node_modules/.bin/bronto-layout --version
./consumer/node_modules/.bin/bronto-layout doctor --verify-launch
```

The expected tarball SHA-256 is `0755daff80a961d1006d118940daaa075c2a0eb6cd97376bb63b8d32d9979e5c` and the verified release source is commit `76d252304ab6fd8f1698fd0136b32091cb19f284`. `shasum -a 256` works on macOS and Linux when Perl's `shasum` is available; otherwise use your system's SHA-256 verification utility. A checksum protects against download corruption/tampering relative to the trusted release checksum—it does not establish an independent security audit. The npm **client** is used to install a local tarball; `npm install @ponchia/layout@0.5.0-beta.0` from the registry still does not work.

## Local first use (no npm registry dependency)

```sh
git clone https://github.com/Ponchia/bronto-layout.git
cd bronto-layout
npm ci
npm run build
node bin/bronto-layout.mjs doctor --verify-launch
node bin/bronto-layout.mjs audit --url http://127.0.0.1:4173 --widths 320,375,768,1280 --json --compact
```

Run a **site you own or are permitted to inspect** at `127.0.0.1:4173`; replace its URL/port. Do not disable the Chromium sandbox against untrusted sites. `audit` exit 0 means only that no supported measured issues were found in the observed state, *not* that the UI is correct. A report may contain selectors, sensitive DOM or page paths; keep it local/private.

Then create or propose a contract based on **actual intended layout relationships**:

```sh
node bin/bronto-layout.mjs suggest --url http://127.0.0.1:4173 \
  --widths 375,768,1280 --out proposed-layout.json
node bin/bronto-layout.mjs review-draft --draft proposed-layout.json --url http://127.0.0.1:4173
# Review the proposal file, and approve only intentional rules:
node bin/bronto-layout.mjs approve --draft proposed-layout.json \
  --accept THE_REVIEWED_RULE_ID --out bronto-layout.json
node bin/bronto-layout.mjs check --spec bronto-layout.json \
  --fail-on-skip --interior-probes 3 --refine --json --compact \
  --report reports/layout.json
```

The `--accept` value is deliberately a placeholder: no agent or script should approve proposals it has only inferred from passing geometry. `--fail-on-skip` prevents missing measurements from being mistaken for a clean strict check. Intentionally out-of-width-range rules remain non-errors. If navigation, coverage or measurements cannot be trusted, **read the JSON**, do not treat a bare exit code as proof of UI quality.

### Why interior probes?

A responsive bug may exist only at 390–410px while 320px and 480px both pass. `--refine` used to bisect only *observed* status changes, so both passing endpoints hid this island. An optional `--interior-probes 3` now tests three evenly spaced positions between each requested width, and `--refine` can locate transitions found there. Sampling is bounded: CLI refuses to proceed if the initial sampling plan exceeds `--max-samples` (default 200), and it never silently skips planned checks. `sampling.largestUntestedGapPx` shows the widest unsampled integer-width interval **between the requested coarse boundaries**, not outside that range. Narrower defects between sampled widths are **still possible**, even when all checks pass. A finer `--scan`, CSS media-breakpoint discovery, and explicit container/UI-state checks remain important.

## Reusable GitHub Action (no npm publication needed)

The repository includes a root [composite Action](https://github.com/Ponchia/bronto-layout/blob/main/action.yml). It builds the pinned source with Node 24, verifies a sandboxed Chrome/CDP session, runs a check or audit, and writes a machine-readable JSON file. The Action **never uploads screenshots or reports automatically**; workflow authors decide whether to retain them. It deliberately does not enable `--no-sandbox`.

Pin the action to **`76d252304ab6fd8f1698fd0136b32091cb19f284`**, the fully reviewed, CI-green GitHub beta source commit—not a moving branch. An example for a local HTTP preview server (start the site's own preview server before checking):

```yaml
name: Layout contracts
on: [pull_request]
permissions:
  contents: read
jobs:
  layout:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: '24'
          cache: npm
      - run: npm ci && npm run build
      - name: Start preview server
        run: |
          npm run preview -- --host 127.0.0.1 --port 4173 > "$RUNNER_TEMP/site-preview.log" 2>&1 &
          echo $! > "$RUNNER_TEMP/site-preview.pid"
      - name: Check approved relationships
        uses: Ponchia/bronto-layout@76d252304ab6fd8f1698fd0136b32091cb19f284
        with:
          spec: bronto-layout.json
          url: http://127.0.0.1:4173
          widths: 320,375,768,1280
          interior-probes: '2'
          refine: 'true'
          fail-on-skip: 'true'
          report: reports/bronto-layout.json
```

The preview command above is for applications that expose `npm run preview`; adjust it to the real project and verify its readiness before the Action. Never treat a failed connection as a passed check. If the target requires authentication, do not put credentials in the URL or upload its reports to a public artifact. Re-run CI on a real runner after pinning the SHA; local Chromium limitations and hosted runner differences are not interchangeable.

### Calling the Action for a conservative audit

Instead of a contract, set `mode: audit`, remove `spec` and `interior-probes`, and supply `url`. Optionally set `fail-on-coverage-gaps: 'true'` if known iframe/canvas/lazy-media omissions should block your workflow. Review-only clipping/spacing/overlap leads never silently become approved contract violations.

## Coding agents: recommended instruction

Add these guardrails to the consuming project's `AGENTS.md` or equivalent. The instructions are an example, **not** automatic modifications to other repositories:

> When changing layout or CSS, run Bronto Layout against a reproducible local build. Begin with the approved contracts. Use `check --fail-on-skip --json --compact`, and on responsive changes consider `--interior-probes 3 --refine` within the sample budget. Compare before/after results where possible. Report failed rule ID, viewport, measured deviation, browser state, and the associated DOM/CSS evidence. Do not invent a source-level CSS cause; matched CSS is only a lead. Distinguish measured problems, review-only warnings and skipped/unverified states. Do not approve suggested contracts or edit production CSS solely because a heuristic reports an overlap. Re-run checks after a human-approved fix. Keep reports/screenshots private when they contain user data or internal URLs. A passing result does not certify visual quality, accessibility or unmeasured widths.

The CLI supports compact JSON for agents and SARIF for explicit `check`/`compare`; `audit` and comparisons of automatic leads do **not** output SARIF. If generating review evidence, retain both the report and its viewport/state metadata; capture and SHA-256 verification are not substitutes for human review.

## Local field-trial plan: decide based on real evidence

Start with **three different, owned projects** rather than adding many features speculatively. Prefer one simple site, one component-heavy app and one multilingual/interactive or media-heavy site. Record the commit, Chrome/Node version, requested/observed widths, locale/state, output classification and whether a human agreed that each reported problem mattered. Keep private evidence out of public issues and PRs. See [field trial worksheet](beta-trial-template.md) and the [independent labeling protocol](field-benchmark.md).

A reasonable beta quality gate for each pilot:

1. The documented first-use path works from a clean checkout and stable Chromium without unsafe sandbox bypass.
2. At least one *reviewed* semantic contract passes the known-good version and fails a **deliberately induced, reversible** defect.
3. An intentional negative control is not incorrectly promoted into a strict defect. Known uninspected paint surfaces are disclosed.
4. A changed website triggers the expected GitHub CI exit code and emits a local report that an agent can act on without guessing CSS causality.
5. Findings, missed defects, setup friction and runtime cost are recorded before designing another feature.

Do not report detector precision/recall from our own synthetic tests or treat a personal project as an independent reviewer. No promotional posts are part of this beta integration work.
