# Security policy

Bronto Layout is a local experimental CLI, not a hosted service. It starts a real browser, reads document geometry and can save screenshots and CSS evidence. Browser/page content and artifact paths can contain private information.

## Supported versions

Security fixes are considered for the current `main` branch and the latest [GitHub beta prerelease](https://github.com/Ponchia/bronto-layout/releases/tag/v0.5.0-beta.1). GitHub tarballs are available, while npm registry distribution is not yet live. Older beta versions have no guaranteed support window.

## Report a vulnerability privately

**Do not open a public issue containing credentials, exploit steps against a live website, private artifacts or personal data.** Use [GitHub's private vulnerability reporting](https://github.com/Ponchia/bronto-layout/security) from the repository's Security tab, which is enabled for this public repository. If you cannot access that flow, request an alternative private channel through the maintainer's GitHub profile without posting exploit details publicly.

Include affected version/commit, OS/Node/Chrome versions, the smallest safe reproduction, expected/actual impact and any mitigation. Please give the maintainer a reasonable opportunity to investigate before disclosing a vulnerability.

## Safe use and trust boundaries

- **Keep Chrome sandboxing enabled** on untrusted websites. `--no-sandbox` and `BRONTO_CHROME_NO_SANDBOX=1` weaken browser isolation; some isolated fixture tests run with this explicit override **only for locally generated, trusted HTML**. All public-site workflows require sandboxed Chromium, with a launch preflight and no fallback bypass.
- Prefer a local development server or HTML fixtures you control; Bronto Layout is **not** a general website isolation tool or an authorization bypass.
- Audit reports, full-page captures and paired screenshots may reveal sensitive DOM text, authenticated pages, pasted inputs or asset URLs. Treat reports as private until inspected and redact before sharing.
- The repository does not use telemetry or hosted services. Adding third-party calls, external uploads, executable scenario scripts or broad arbitrary network targets requires separate security review.
- Layout evidence is not a guarantee of accessibility, user data security or visual correctness.
