# Bronto Layout documentation

Lifecycle: current

Start with the [repository demonstration](../README.md) or the
[first-run guide](quickstart.md). Browser checks require Node.js 22+ and an
installed Chromium-family browser; the pure TypeScript engine does not.

| Task | Guide |
| --- | --- |
| Install, inspect a page and define a relationship | [First run](quickstart.md) |
| Integrate in CI or an agent workflow | [Beta integrations](beta-integration.md) |
| Reuse an existing Playwright page | [Playwright adapter](playwright-adapter.md) |
| Explore state replay, schemas and evidence recipes | [Extended recipes](recipes.md) |
| Understand commands and exit codes | [CLI reference](cli-reference.md) |
| Review proposed contracts before enforcing them | [Contract discovery](contract-discovery.md) |
| Reproduce a caught alignment regression | [Portfolio case study](portfolio-regression-case-study.md) |
| See the real first-party CI consumer | [Bronto UI integration](real-consumer-brontoui.md) |
| Understand implementation boundaries | [Architecture](architecture.md) |
| Read validation scope and limitations | [Validation](validation.md) |
| Reproduce the internal acceptance matrix | [In-house validation](in-house-validation.md) |
| Qualify a public beta in-house | [Active release gates](release-checklist.md) |
| Publish and verify exact npm bytes | [npm publication](npm-publishing.md) |

## Validation records

[Controlled audit benchmarks](audit-benchmark.md), [first-party pilots](first-party-beta-pilots.md),
[owned-site layout pulse](first-party-pulse.md), [OSS field study](oss-field-study.md),
[mobile states](oss-mobile-state-study.md), [scroll states](oss-scroll-state-study.md),
[pinned source-built case](oss-source-built-study.md), and the
[historical flex regression](oss-historical-flex-regression.md) describe different
evidence. Controlled fixtures and first-party use are not independent adoption.
The [field protocol](field-benchmark.md) retains a method for independent labels;
it does not make outside reviewers a beta-release dependency.

The [October 14 checklist](archive/release-checklist-2026-10-14.md) is historical.
Use the active release gates rather than treating old unchecked items as current
blocking work. Optional feedback material remains in [first-use trial](first-use-trial.md).
