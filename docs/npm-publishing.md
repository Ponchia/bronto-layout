# npm beta publication

Lifecycle: current

The intended package identity is `@ponchia/layout`, published by an authorized
owner of that npm scope from `Ponchia/bronto-layout`. Verify the live npm
identity and permission before the first write. First publication and subsequent
trusted-publisher releases have different authentication paths. The current
registry state must be checked live; a GitHub tag or release is not npm availability.

## First publication

Qualify a new beta from reviewed main using the [release gates](release-checklist.md).
Use its exact built archive, not an old tarball merely because it already exists.
The following placeholders must come from that qualified candidate:

```sh
VERSION=0.5.0-beta.2
TARBALL="/absolute/path/ponchia-layout-$VERSION.tgz"
npm whoami --registry=https://registry.npmjs.org
npm view "@ponchia/layout@$VERSION" version --registry=https://registry.npmjs.org
sha256sum "$TARBALL"
```

A missing version is expected; an authorization, network or rate-limit error
is not proof of availability. Verify the expected SHA-256 and package identity,
then perform the separately authorized first release:

```sh
npm publish "$TARBALL" --ignore-scripts --access public --tag beta \
  --provenance=false --registry=https://registry.npmjs.org
```

Use normal npm login and 2FA. Complete browser/passkey challenges interactively;
never paste a password or token into an issue, transcript or repository. Local
bootstrap cannot establish hosted OIDC provenance. Do not claim it does.

Immediately verify the exact public archive using the checked source tree:

```sh
node scripts/verify-registry-release.mjs --version "$VERSION" --tarball "$TARBALL"
```

Then install `@ponchia/layout@<exact-version>` in a fresh directory with
`--ignore-scripts`, exercise its installed binary/API, and run `npm audit signatures`.
Retain evidence outside the public source repository when it contains private paths.

## Configure the trusted publisher

Once the package exists, use npm package settings or `npm trust` with normal
interactive account authentication to set:

| Setting | Value |
| --- | --- |
| Provider | GitHub Actions |
| Organization/user | `Ponchia` |
| Repository | `bronto-layout` |
| Workflow | `npm-release.yml` |
| Environment | `npm-publish` |
| Allowed action | Direct `npm publish` |

Do not widen the trust to other repositories, remove environment review, enable
extra tag-management privileges or weaken npm account security. Keep the
existing protected GitHub environment. The first publisher needs an existing
package; its identity is separate from GitHub authentication.

## Later beta releases

A new `v<version>-beta.<number>` tag on reviewed main starts the full hosted CI
and macOS gates. Preflight builds and checks a single archive before approval.
The protected publish job receives only that archive and checksum; it has no
source checkout, dependency install or repository-script execution.

After npm accepts it, a **separate read-only job** checks the registry identity,
SHA-512 integrity, downloaded bytes, `beta` tag and provenance metadata. It
installs the exact version in a clean consumer and verifies signatures with npm.
Only that successful job permits the GitHub prerelease with matching bytes.
The verifier distinguishes advertised provenance from cryptographic verification.
No stable `latest` release is advanced by this beta workflow.

## Recovery

A failed verification does not undo an accepted publication. Do not re-publish,
overwrite the version or change dist-tags to hide a failure. Inspect the registry
and rerun only the read-only verifier/job against the original archive. A failed
GitHub announcement can be recovered separately after the same bytes are verified.
Network diagnostics never authorize a second irreversible write.

Sources: [npm trusted publishers](https://docs.npmjs.com/trusted-publishers/),
[npm 2FA](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/),
[signature verification](https://docs.npmjs.com/verifying-registry-signatures/).
