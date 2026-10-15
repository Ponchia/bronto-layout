# npm publication: first bootstrap and protected OIDC updates

**Registry status (14 October 2026):** `@ponchia/layout` has not been published to npm (`E404`). Bronto Layout's experimental [v0.5.0-beta.1 GitHub release](https://github.com/Ponchia/bronto-layout/releases/tag/v0.5.0-beta.1) is available as a checksum-verified npm-compatible `.tgz`. The development environment is not authenticated (`npm whoami` returns `ENEEDAUTH`).

## 1. One-time first publication (authenticated owner)

The npm scope is already used for [@ponchia/ui](https://www.npmjs.com/package/@ponchia/ui) and [@ponchia/annotations](https://www.npmjs.com/package/@ponchia/annotations). The npm account `ponchia` maintains `@ponchia/ui`. **Do not rename the scope** or mistake an existing GitHub package for an npm registry release.

**Important:** npm's trusted-publisher configuration requires an existing package. The first publish must be performed by the authenticated maintainer; the GitHub OIDC workflow cannot publish a nonexistent `@ponchia/layout` package. No usable npm credential is installed in the devbox or GitHub repository. Do not commit a token, paste an OTP into a log, or enable public-site browser sandbox bypass to complete this step.

After reviewing the existing [GitHub beta.1 release](https://github.com/Ponchia/bronto-layout/releases/tag/v0.5.0-beta.1), download its `.tgz` and `SHA256SUMS.txt` into the **same clean directory**. On an authorized computer with npm 11+ and the correct `ponchia` npm account authenticated:

```sh
sha256sum -c SHA256SUMS.txt
# Expected archive checksum:
# f471a03498980d80ce304aa45a04e8b468736f51478822b7620ffc147a7b1de8
npm whoami --registry https://registry.npmjs.org
npm view @ponchia/layout@0.5.0-beta.1 version --registry https://registry.npmjs.org
# The exact version should still return E404; do not overwrite any package.
npm publish ./ponchia-layout-0.5.0-beta.1.tgz \
  --ignore-scripts --access public --tag beta --provenance=false \
  --registry https://registry.npmjs.org
```

The last command is an irreversible registry write; **only the authorized maintainer executes it**. The local bootstrap cannot produce OIDC provenance, so `--provenance=false` is explicit. Do not claim that it has supply-chain attestation. If the network fails after submission, **look up the registry state before any retry**; npm never permits republishing the same name/version. Verify the exact package, install as an external consumer, confirm `dist-tags.beta` and ensure `latest` wasn't inadvertently assigned:

```sh
npm view @ponchia/layout@0.5.0-beta.1 version dist.integrity --json
npm view @ponchia/layout dist-tags --json
npm install --prefix ./consumer @ponchia/layout@0.5.0-beta.1
./consumer/node_modules/.bin/bronto-layout --version
```

A successful local bootstrap allows us to secure **subsequent, differently versioned** releases using GitHub OIDC.

## 2. Configure the trusted publisher (npm account settings)

In npm's newly published `@ponchia/layout` **Settings → Trusted publishing**, register exactly:

| Field | Value |
| --- | --- |
| Provider | GitHub Actions |
| GitHub owner | `Ponchia` |
| Repository | `bronto-layout` |
| Workflow filename | `npm-release.yml` |
| GitHub environment | `npm-publish` |
| Allowed action | `npm publish` |

Only enter the **filename**, not `.github/workflows/npm-release.yml`. Our [tag-driven release workflow](../.github/workflows/npm-release.yml) runs on GitHub-hosted CI with protected `npm-publish` Environment review. It reruns the exact normal Node 22/24 Chromium and macOS workflows at the tag, then validates that the tag is a beta, its commit is reachable from `main`, its version matches `package.json`, the npm version does not already exist, tests pass, and the archive has compiled JS/type declarations and no private files. Its nonprivileged job builds and verifies a source archive. After **manual GitHub environment approval**, the one OIDC job downloads the **exact SHA-256-checked tarball** without checking out or executing project source, then publishes under `--tag beta` with no long-lived credential. It never publishes on a PR or ordinary `main` push.

Choose a **new reviewed version**, for example `0.5.0-beta.2`, and create its immutable Git tag only after its source, tests and release-preflight run agree. Do not move an existing tag or republish `0.5.0-beta.1` through OIDC. npm trusted publisher configurations may require first use within two days of setup; verify those details when authorizing the next release. The protected environment does not authorize unreviewed publishes.

After OIDC publishing, the gated release workflow also attaches that same checksum-verified package to a GitHub beta release. Verify the exact registry archive and the automatic provenance attestation, fresh Linux/macOS consumer installation, and `dist-tags.beta` from the public registry. A failed GitHub release step never authorizes replaying a completed npm publication. Do not automatically promote experimental versions to `latest`; formal stability and marketing remain separate decisions.

**Sources:** [npm trusted publishers](https://docs.npmjs.com/trusted-publishers/) and [npm CLI trusted-publisher prerequisites](https://github.com/npm/cli/blob/latest/docs/lib/content/commands/npm-trust.md). The initial registry bootstrap cannot be completed by an unauthenticated agent.
