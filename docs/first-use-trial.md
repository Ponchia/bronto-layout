# First-use trial — independent developer feedback

**Status:** experimental public repository; no npm package has been published.
This is a short, self-directed usability trial for people who have not helped
build Bronto Layout. It is **not** an automated benchmark or human annotation
protocol for calculating detector accuracy.

Try it without receiving a private walkthrough from the maintainer. You need
Node.js 22+, Chrome/Chromium, and about 15–20 minutes. A local development
website you own or are authorized to inspect is useful but optional.

No account, telemetry, paid service, or LLM is involved. The commands run
locally, and you choose what (if anything) to report publicly.

## 1. Get a first result

Start with a fresh clone rather than a contributor's existing `node_modules`:

```sh
git clone https://github.com/Ponchia/bronto-layout.git
cd bronto-layout
npm ci
npm run build
node bin/bronto-layout.mjs doctor --verify-launch --json
```

Note how long this took, and whether the last command reported
`launch-verified` or exited `2`. Do not work around Chromium sandbox failures
by visiting an unfamiliar public site with `--no-sandbox`. If a normal Chrome
launch is not possible, that is valuable feedback: record where you got stuck.

## 2. Run one passing and one failing layout check

The repository contains two self-contained versions of a portfolio. They
differ by a deliberate 18 CSS-pixel desktop image/paragraph misalignment.

```sh
# Expected: exit 0, no failed contract rules.
node bin/bronto-layout.mjs check \
  --spec examples/portfolio-alignment.json \
  --url examples/portfolio-alignment-healthy.html

# Expected: exit 1, one alignment rule fails at 768 and 1280px.
node bin/bronto-layout.mjs check \
  --spec examples/portfolio-alignment.json \
  --url examples/portfolio-alignment-broken.html
```

The second exit code of `1` is **intentional**. Don't repair the fixture.
Write down whether you could understand *what* changed and *at which widths*
without reading the source, or whether the report was confusing.

## 3. Try your own local page (optional)

Start your application's normal development server, then substitute its local
URL in the command below. Use only a page you have permission to inspect.

```sh
node bin/bronto-layout.mjs audit \
  --url http://localhost:5173 \
  --widths 320,375,768,1280 --json --compact
```

The automatic audit reports measured DOM facts such as horizontal document
overflow and visibly failed image loads. Other possible issues are review
leads; a green exit does **not** prove your design is correct. An iframe's
internal layout, closed shadow DOM or canvas/WebGL rendering may be unverified.

If the page uses intentionally aligned or spaced elements, you can also try:

```sh
node bin/bronto-layout.mjs suggest \
  --url http://localhost:5173 \
  --widths 375,768,1280 \
  --out local-proposals.json
```

This only suggests observed relationships. **Nothing is approved or made
blocking automatically.** Did you understand how to choose which relationship
is an actual design requirement? If not, stop there and describe the friction.

Do not upload an authenticated screenshot, sensitive source, private hostname,
tokens, cookies, customer data, or an unredacted JSON report to a public issue.

## 4. Tell us what happened

Use the [first-use feedback issue form](https://github.com/Ponchia/bronto-layout/issues/new?template=first-use.yml)
or add a sanitized comment to
[the external first-use milestone](https://github.com/Ponchia/bronto-layout/issues/64).
Even an unsuccessful installation is useful feedback. Please report:

- The operating system, Node major version, browser family, and whether
  sandboxed browser launch worked (no system IDs or usernames).
- Approximate time to first useful result; the first command or step that was
  confusing or failed.
- Whether the deliberate passing/failing portfolio examples were understandable.
- If you tried a permitted local site, whether Bronto Layout found something
  you cared about, gave an unhelpful warning, or missed a *known* design issue.
- One concrete wording or workflow change that would make the first attempt
  easier.

A failure to inspect a page is not evidence of a healthy layout. A warning is
not necessarily a defect. Only **independently reviewed, explicitly labeled**
rendered states should contribute to real-world detector precision or recall;
that separate protocol is described in
[the field benchmark guide](field-benchmark.md).

This trial is not required for ordinary contributions or for using the tool.
It exists to prevent repository activity and synthetic tests from being
mistaken for adoption or external product validation.
