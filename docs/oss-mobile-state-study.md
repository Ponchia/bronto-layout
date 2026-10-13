# Open-source mobile navigation: stateful external validation

The [initial third-party OSS audit](oss-field-study.md) measured 24 first-viewport
states across unrelated open-source websites. It deliberately did not interact
with menus. A website can pass its closed-menu inspection while having an
unusable, overflowing or inaccessible **opened** mobile navigation state.

This separate, **manual-only** study checks five independently maintained,
public documentation pages at 375 CSS pixels: Astro (English and Spanish),
Docusaurus, Vite and Svelte. Their source repositories are linked from the
[external OSS study](oss-field-study.md). Each URL, button and expected
post-click selector is versioned under
[the mobile-state manifest](../benchmarks/oss-mobile-states.v0.1.json).

## What exactly gets tested?

Bronto Layout navigates each exact public URL with a fresh, anonymous
sandboxed Chrome profile. It clicks a pre-reviewed mobile menu control,
briefly waits for the normal UI transition, and checks three assertions:

- The **opened-menu state** exists exactly once after the click, proven by a
  CSS state selector or the menu button's own `aria-expanded=true` attribute.
- The expected mobile-menu button remains present.
- The main document remains present.

This is intentionally a low-risk first phase. These constraints establish
that a specific DOM state was reached; they do **not** prove that all menu
items are visible, keyboard-accessible, comfortably spaced or clickable.
The workflow also captures a separate automatic audit and screenshot
**after replaying the same declared menu action**. Any overflow or review
lead requires independent examination before being called a real defect.

The study does not click outbound links, submit forms, fill fields, log in,
modify accounts, inject arbitrary JavaScript or accept runtime URLs from a
GitHub workflow input. Only fixed checked-in public pages are tested.

## Running and reviewing

From GitHub Actions select **External OSS mobile navigation states** and
start a manual run on the reviewed branch. The runner builds the source CLI,
verifies every contract and starts installed stable Chrome with its default
sandbox. It does not use the sandbox override permitted for bundled trusted
HTML fixtures.

For each case, the runner stores post-click contract JSON, audit JSON,
a viewport screenshot, and the reproducible public click/pause action list.
All files are SHA-256 indexed. GitHub keeps the temporary artifact for seven
days; private copies should be checked before the artifact expires.

A contract failure is an **unverified test state**, not automatically a
website defect. Reviewers should inspect whether the site changed, hydration
was incomplete, the action selector drifted, or the menu genuinely failed.
An automatic audit exit `1` reports measured geometry but does not by itself
prove unwanted scroll or bad user experience. Coverage warnings and canvas
paint gaps remain explicit.

## First live observations — 13 October 2026

The [first manual OSS mobile-menu run](https://github.com/Ponchia/bronto-layout/actions/runs/38383862119)
completed successfully on merged commit `a144dcb`. All **five public menus**
reached their expected post-click states at 375 CSS pixels, with **15/15
explicit DOM-state assertions passing**, **zero measured audit errors**, and
no incomplete top-level browser traversals. The menu panels are also visible
in the captured initial-viewport screenshots.

The run yielded two nonblocking `pending-image` review warnings: one visible
pending image on Astro EN and three on Astro ES. These are *counts inside two
warnings*, not four independently confirmed defective images. Docusaurus,
Vite and Svelte reported no measured issues or review warnings in these
opened-menu states. No new upstream website defects have been established.

All **21 original artifact-file hashes** were verified after relocating the
first captured archive. This exposed a portability issue: the generated
checksum manifest used paths relative to the original GitHub Actions workspace
rather than the extracted artifact root. The workflow now emits relocatable
relative paths and verifies its checksum manifest before upload. A subsequent
manual run is required to confirm this updated artifact format in GitHub.

These are **automation-assisted measurements**, not external human design
labels. In particular, selector-count success and a screenshot that shows
an opened menu cannot certify its keyboard behavior, focus management or
touch ergonomics.

This study is *not* an independent human-labeled detector accuracy benchmark.
It is a reproducible exercise in testing actual **user interaction states**
and observing how reliably Bronto Layout identifies those states. If one
selector stops working, correct the case with source-backed evidence; do not
silently weaken it into a passing body-only check.

For exact required user-intent assertions and release-gating CI, prefer
[BrontoUI's reviewed semantic contracts](real-consumer-brontoui.md), already
adopted in a separate repository's required CI.
