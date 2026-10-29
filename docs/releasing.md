# Releasing to npm

Package: `@compn3rd/pi-web-code-review` · repository: `CompN3rd/pi-web-code-review`.

## Security model: stage with OIDC, approve on npm with 2FA

`.github/workflows/publish.yml` (**Stage npm release**) runs on `v*` tag pushes or manual dispatch **on a tag**. It rejects non-stable/mismatched package versions and commits outside `origin/main`. Actions are pinned to current Node-24-native release SHAs; checkout credentials are not persisted. Permissions default to none; only verification gets repository read permission, and only staging gets `id-token: write`.

The verification job installs with lifecycle scripts disabled, runs tests/build/artifact and Chromium checks, packs the verified build, and smoke-tests the extracted tarball. Its isolated `npm publish --dry-run` checks artifact handling only: it does **not** prove OIDC authentication, staging permission or publication permission.

The separate staging job downloads that same run's verified tarball. It does not check out source, install project dependencies, cache packages or execute package scripts. It validates the tarball's package name/version/repository before invoking `npm stage publish` with OIDC and provenance. **Do not add npm token secrets.** setup-node's token-oriented `registry-url` configuration is intentionally absent; the registry is explicit on the command line. No dummy token or deprecated `always-auth` configuration is used.

The job requires npm **>=11.15.0** for staged publishing; Node 24 supplies the CLI. Its verbose npm output provides OIDC exchange diagnostics without intentionally printing credentials. Never dump environment variables, raw JWTs, or the npm debug/cache directory into logs or artifacts.

A successful workflow means **staged, not published**. An npm maintainer must review and approve the stage with **2FA** before the version becomes public. The workflow never runs `npm stage approve` and must not be granted direct publish or dist-tag permissions as a workaround.

## Owner configuration

The GitHub `npm` environment requires `CompN3rd` approval and allows **tags `v*` only**. Verify repository **Settings → Environments → npm**. This is a single-maintainer gate with self-review allowed; administrators retain their ability to change protections. Add independent reviewers if the team grows.

The npm owner confirmed that the trusted publisher is configured for **staged publishing with 2FA approval**, not direct publication. In npm package **Settings → Trusted publishing**, the connection should match these case-sensitive fields:

| Field | Exact value |
| --- | --- |
| Provider | GitHub Actions |
| Organization or user | `CompN3rd` |
| Repository | `pi-web-code-review` |
| Workflow filename | `publish.yml` |
| Environment name | `npm` |
| Allowed action | Stage only: `npm stage publish` |

Keep direct `npm publish` and dist-tag management disabled. A new unvalidated connection must complete its first successful publish within two days under current npm policy; inspect its status and recreate it if expired. An established validated connection does not expire every two days.

Use npm **Require two-factor authentication and disallow tokens**, and revoke unused automation tokens after confirming OIDC works. This does not disable trusted publishing. Consider a tag ruleset restricting `v*` creation/update/deletion to release maintainers. The workflows do not create such a ruleset.

References: [trusted publishing](https://docs.npmjs.com/trusted-publishers/), [staged publishing](https://docs.npmjs.com/staged-publishing/).

## Release procedure

1. Update package/lock versions, changelog and documentation.
2. Run `npm run verify`, `npm run check:browser`, and inspect screenshots. Live-host limitations remain in `docs/ui-testing.md`.
3. Commit/push `main`, then create and push an annotated matching `v<version>` tag.
4. Open GitHub Actions → **Stage npm release**. Review verification results and the `npm-package`/`release-ui-screenshots` artifacts. Approve the GitHub `npm` environment deployment.
5. When staging succeeds, record the stage ID from npm output. Open npmjs.com **Staged Packages**, review the package/version/provenance and compare the staged tarball's integrity with the verified artifact. CLI alternatives are `npm stage view <stage-id>` and `npm stage download <stage-id>` using maintainer authentication.
6. Approve on npmjs.com with **2FA**, or interactively use `npm stage approve <stage-id>`. Do not automate this proof-of-presence approval in GitHub.
7. Confirm the exact public version and `dist.integrity` with `npm view @compn3rd/pi-web-code-review@<version> version dist.integrity`; verify provenance points to the intended commit/workflow. Only then publish the draft GitHub release.

## Failures and retries

A failed job does not prove no registry state changed. Check the exact public version **and pending npm stages** before retrying, to avoid duplicate stages. A stage-only credential cannot be tested by trying direct publication. `npm whoami` and successful dry-runs are not OIDC permission checks. Provenance signing is independent of npm registry authorization.

For auth failures inspect the verbose OIDC exchange result, then check trust identity, environment, permissions and expiry. Do not add a token, disable 2FA, or enable direct publish just to bypass a failure.

Rerunning an old workflow uses the old tagged workflow revision, not new YAML on main. If workflow changes are required, use a new release version/tag or obtain explicit owner approval to move an unpublished tag. Never overwrite a published version. Publishing is separate from PI WEB installation; this workflow never restarts the daemon.
