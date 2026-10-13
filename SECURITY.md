# Security policy

Bronto Layout is a local experimental CLI, not a hosted service. It starts a real browser, reads document geometry and can save screenshots and CSS evidence. Browser/page content and artifact paths can contain private information.

## Supported versions

Security fixes are considered for the current `main` branch and the latest tagged release, if one exists. No npm package or tagged release exists as of the v0.4.0 release candidate. There is no guaranteed support window for old development revisions.

## Report a vulnerability privately

**Do not open a public issue containing credentials, exploit steps against a live website, private artifacts or personal data.** Use [GitHub's private vulnerability reporting](https://github.com/Ponchia/bronto-layout/security) from the repository's Security tab, which is enabled for this public repository. If you cannot access that flow, request an alternative private channel through the maintainer's GitHub profile without posting exploit details publicly.

Include affected version/commit, OS/Node/Chrome versions, the smallest safe reproduction, expected/actual impact and any mitigation. Please give the maintainer a reasonable opportunity to investigate before disclosing a vulnerability.

## Safe use and trust boundaries

- **Keep Chrome sandboxing enabled** on untrusted websites. `--no-sandbox` and `BRONTO_CHROME_NO_SANDBOX=1` weaken browser isolation; existing CI uses this only on ephemeral isolated runners for narrow trusted fixtures and specifically allowlisted first-party public pages.
- Prefer a local development server or HTML fixtures you control; Bronto Layout is **not** a general website isolation tool or an authorization bypass.
- Audit reports, full-page captures and paired screenshots may reveal sensitive DOM text, authenticated pages, pasted inputs or asset URLs. Treat reports as private until inspected and redact before sharing.
- The repository does not use telemetry or hosted services. Adding third-party calls, external uploads, executable scenario scripts or broad arbitrary network targets requires separate security review.
- Layout evidence is not a guarantee of accessibility, user data security or visual correctness.
