# Bronto Layout: first useful check

Lifecycle: current

Bronto Layout checks explicit relationships in a page: for example, whether an
image stays aligned with its text. Node.js 22+ and an installed Chrome or
Chromium are required for browser checks. The tool does not need a hosted
account, a component framework, or a bundled browser.

## Start with the published npm beta

You need a local Node.js 22+ project and Chrome/Chromium installed. Use the
published package; a source checkout and build are not required for first use.

```sh
mkdir bronto-layout-first-run
cd bronto-layout-first-run
npm init -y
npm install --save-dev @ponchia/layout@beta
npx --no-install bronto-layout doctor --verify-launch --json
```

A successful preflight returns `launch-verified`. Finding a Chrome executable
alone does not establish startup. Use `--chrome /path/to/chrome` if choosing a
different installed browser. Do not disable sandboxing to inspect public or
authenticated pages.

The installed package includes the complete example contract and its healthy
and broken HTML fixtures. The commands below only read those trusted examples
from the npm package; they do not install extra browser automation tools.

If you are changing Bronto Layout itself, use the
[contributor instructions](../CONTRIBUTING.md) for the separate source
checkout and build workflow.

## Observe a passing rule and a deliberate failure

```sh
npx --no-install bronto-layout check \
  --spec node_modules/@ponchia/layout/examples/portfolio-alignment.json \
  --url node_modules/@ponchia/layout/examples/portfolio-alignment-healthy.html

# The next command deliberately fails (exit code 1).
npx --no-install bronto-layout check \
  --spec node_modules/@ponchia/layout/examples/portfolio-alignment.json \
  --url node_modules/@ponchia/layout/examples/portfolio-alignment-broken.html
```

The first command exits 0. The second exits 1: its image is intentionally
18 pixels lower than its text at the desktop/tablet widths. The contract
allows the stacked mobile layout. This is a controlled example, not a claim
about the accuracy of a general visual detector.

## Inspect your own local page

Start your application's usual development server, then run:

```sh
npx --no-install bronto-layout audit --url http://localhost:5173 \
  --widths 320,375,768,1280 --json --compact
```

Measured overflow and failed visible images differ from review-only leads
and unavailable surfaces. A clean audit does not establish that your visual
design is correct. Define the relationships you intend to preserve:

```sh
npx --no-install bronto-layout init --url http://localhost:5173 \
  --out bronto-layout.json
npx --no-install bronto-layout validate --spec bronto-layout.json --json
```

Edit the generated selectors and rules before enforcing them. Suggestions
are drafts, never automatically approved constraints. Then run `check --spec`
on the reviewed contract. Use a separate `--report` path so input files and
local pages remain unchanged.

## Interpret the result

| Exit | Meaning |
| --- | --- |
| 0 | Observed checks passed or no verified regression was found. |
| 1 | A measured violation or regression was found. |
| 2 | Invalid input, runtime failure, or unverified evidence. |

A comparison with no applicable rules exits 2. Two missing measurements are
unverified, not unchanged. Mutating `click`, `fill`, and `scroll-into-view`
actions require exactly one matching target; `wait-for` only checks existence.
Closed shadow roots, canvas paint, cross-origin frame contents, and untested
states remain outside the verified scope.

Continue with [integration recipes](beta-integration.md), the
[Playwright adapter](playwright-adapter.md), or [extended CLI recipes](recipes.md)
for schemas, state replay, screenshots, responsive sampling, and batch checks.
The [in-house acceptance matrix](in-house-validation.md) describes how releases
are tested without assigning work to external developers.
