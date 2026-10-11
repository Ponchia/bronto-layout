# Review-first layout contract discovery

`bronto-layout suggest` is an experimental bridge between zero-contract audits
and durable authored layout intent. It collects browser geometry at the chosen
viewport widths, identifies simple candidate selectors and suggests relationships
that **currently pass**. Passing geometry does not establish design intent.

## Run against an ordinary page

```sh
node bin/bronto-layout.mjs suggest --url examples/healthy.html \
  --widths 375,768,1280 --out reports/gallery-proposals.json --json
```

No browser extension, server, AI or existing layout contract is required. To
avoid automated selector guessing, specify your own selectors instead:

```sh
node bin/bronto-layout.mjs suggest --url examples/healthy.html \
  --selector shell=.shell --selector heading=.heading \
  --selector gallery=.gallery --selector cards=.card \
  --widths 375,768,1280 --out reports/review.json
```

A proposal contains a unique ID, exact rule, rationale, measured deviations,
viewport widths and `reviewRequired: true`. Repeated gaps may be **width-scoped**
when several consecutive sampled widths support them. It cannot establish what
happens between those widths. Proposals never automatically become checks.

## Accept only reviewed rules

Inspect the draft. Choose the relationships that are actually intended,
including their responsive boundaries, then approve explicit IDs:

```sh
node bin/bronto-layout.mjs approve --draft reports/review.json \
  --accept document-horizontal-fit,contained-shell \
  --out reports/accepted-layout.json
node bin/bronto-layout.mjs validate --spec reports/accepted-layout.json
node bin/bronto-layout.mjs check --spec reports/accepted-layout.json \
  --url examples/healthy.html --json --compact
```

`approve` refuses an omitted or unknown selection, duplicate IDs, invalid
contracts and overwriting an existing file unless `--force` is deliberately
provided. The draft is preserved separately; accepted constraints use the
existing versioned contract schema, normal exit codes and CI reporting.

## Scope and limits

- Automatic selector discovery considers visible landmarks, stable IDs,
  unique `data-testid` attributes and repeated direct siblings. It favors
  simple, unique selectors over guessed long positional paths.
- Open Shadow DOM can be reached with explicit selectors such as
  `host >>> .child`, but automated discovery does not enter shadow roots.
- Candidate relationships include document horizontal fit, horizontal
  containment, centering, left/right alignment and repeated gaps. There is
  deliberately no universal assertion that all overlaps or clipping are bugs.
- It measures actual browser CSS rectangles, **not** visual desirability,
  accessibility, canvas/WebGL internals or how a design should be repaired.
- Sampling does not prove that a layout is correct between or outside tested
  widths. Routes, language, touch mode, dark mode, fonts and content states
  must be explicitly exercised and reviewed. `suggest` can use the existing
  `--locale`, `--mobile`, `--color-scheme` and state setup flags, but these
  environment options are not yet stored as reusable contract defaults;
  apply the same flags when later checking that state.
- Suggested selectors can become stale after a redesign. Review or update
  them rather than treating an old draft as a timeless specification.

This is a first usability slice. A visual selection/approval inspector,
contract editing and full state persistence are still future work.
