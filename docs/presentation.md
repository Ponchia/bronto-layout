# Product presentation and first-use evidence

Lifecycle: current

The static product page in `site/` introduces an explicit layout relationship,
shows a controlled failure, then leads through the published-package first run.
It works without JavaScript, remote fonts, accounts or Spatial. This source
change does not enable hosting or deploy the page.
The review page carries `noindex, nofollow`. It has title/description Open Graph
metadata but no canonical, deployed URL or remote social image. Choose those
only when a public destination is approved, and remove the preview indexing
restriction as part of that separate hosting change.

## Preview the page

From a contributor checkout with dependencies installed:

```sh
npm run build:presentation
python3 -m http.server 8779 --bind 127.0.0.1 --directory reports/presentation
```

Open `http://localhost:8779`. The build copies the HTML, CSS and generated
first-use assets into `reports/presentation`, then verifies local links, image
paths and fragment targets. Stop the preview server when finished. Hosting
decisions are separate from building this directory.

## Regenerate the npm example

Use a fresh consumer outside the checkout. The exact published version is
intentional: the current source version can differ from the registry version.

```sh
npm install --ignore-scripts --no-audit --no-fund \
  --prefix /tmp/layout-first-use @ponchia/layout@0.5.0-beta.2
npm run capture:first-use -- \
  --package-root /tmp/layout-first-use/node_modules/@ponchia/layout \
  --out /tmp/layout-first-use-evidence
```

Node.js 22+ and an installed Chrome/Chromium are required. The generator checks
`doctor --verify-launch`, validates the contract, runs healthy and broken checks
at 375/768/1280px, verifies their exit codes and captures both selected layouts
at 768×440. It asserts the observed top-edge differences are 0px and 18px.
Unexpected runtime failures stop generation. The capture uses the installed
CLI, without importing this checkout's engine or a browser automation runtime.

Review the PNGs, text output and `evidence.json` before copying only those five
files into `docs/assets/first-use/`. The generator also retains intermediate
`inspect` captures beneath its output directory; they are not presentation
assets. The JSON identifies the package version, fixture hashes and screenshot
hashes. Text output replaces machine-specific package paths with `$PACKAGE`.
The red `inspect` overlay selects elements; it is not a failure marker.

Normal sandboxed launch is the default. On a restricted test host only, the
generator accepts an explicit `--no-sandbox` override for these trusted,
self-contained installed fixtures and records that fact. This is not the
recommended first-use path or a safe option for arbitrary websites.

## Review the rendered journey

Check 320px and 390px phones, 768px tablet, 1280px laptop and 1920px desktop.
Confirm the page has no horizontal overflow, screenshots load, commands wrap
without losing characters, and the install → doctor → pass → fail sequence
stays readable. At 320px, repeat with the root font size doubled. Navigate
with Tab and activate the skip link and first-run anchor; visible focus must
remain clear. Repeat with JavaScript disabled and reduced motion enabled.
Use touch emulation to activate the first-run link and inspect its hit target.

The source-controlled `scripts/check-presentation-browser.js` runs these
bounded checks through `playwright-cli run-code --filename=/absolute/path`.
Start its browser on the preview URL. Keep rendered screenshots in an absolute
cache path and close the browser and server afterwards.

External documentation links target maintained GitHub paths. Check them on the
reviewed branch before merge; new documentation becomes available on `main`
only after merge. Neither a static link check nor this controlled example
establishes full accessibility, detector accuracy or real-world adoption.

## Inspect the rule before installing

The product page includes the exact alignment rule from the captured contract,
not an independently maintained code sample. Its build verifies the contract,
fixture and screenshot SHA-256 values before writing the downloadable files.
A source change therefore requires matching evidence before the page can build.

The complete contract and both self-contained HTML fixtures can be downloaded
or opened directly. Opening an HTML file only shows its layout; it does not run
CLI checks. Under 768 CSS pixels both fixtures deliberately stack and the
alignment rule is skipped. The CLI quickstart retains normal browser sandboxing.

The evidence captions and result badges remain at least 12 CSS pixels at the
normal root size, and command text at least 14. The presentation checks cover
320, 390, 768, 1280 and 1920 CSS-pixel widths, 200% root text at 320 pixels,
keyboard focus, touch emulation and the no-JavaScript fixture links. These are
bounded browser checks, not a full accessibility or physical-device review.
