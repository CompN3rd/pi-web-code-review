# Releasing to npm

Package: `@compn3rd/pi-web-code-review` · repository: `CompN3rd/pi-web-code-review`.

## Security model

`.github/workflows/publish.yml` runs on `v*` tag pushes (or manual dispatch **on a tag**, for retries). It rejects non-stable/mismatched package versions and commits outside `origin/main`. Actions are pinned to commit SHAs, checkout credentials are not persisted, and permissions default to read-only.

The verification job installs with lifecycle scripts disabled, runs all tests/build/artifact and Chromium UI checks, packs the built package without rerunning lifecycle scripts, then smoke-tests the extracted tarball. The separate publish job downloads that exact run's artifact; it does not check out source, install project dependencies or run package scripts. Only that job receives `id-token: write`.

Publishing uses npm OIDC trusted publishing and provenance on a GitHub-hosted runner. **Do not add `NPM_TOKEN` or `NODE_AUTH_TOKEN` secrets.** Node 24 supplies the CLI; the workflow checks npm >=11.5.1. Publication is gated by the `npm` GitHub environment, with a required maintainer approval and tag-only deployment policy. Review uploaded screenshots and verification results before approving. This single-maintainer repository allows the triggering maintainer to approve; add another reviewer and prohibit self-review if the team grows. GitHub administrators retain their platform-level ability to change protections.

## One-time owner setup

The GitHub `npm` environment has been configured with `CompN3rd` as required reviewer and deployment policy **tag `v*` only**. Verify these settings under repository **Settings → Environments → npm** before the first publish.

On npmjs.com, open **@compn3rd/pi-web-code-review → Settings → Trusted publishing** and add GitHub Actions:

| Field | Exact value |
| --- | --- |
| Organization or user | `CompN3rd` |
| Repository | `pi-web-code-review` |
| Workflow filename | `publish.yml` |
| Environment name | `npm` |
| Allowed action | Allow direct `npm publish` |

The workflow uses `npm publish`, not `npm stage publish`. If npm offers stage-only permission by default, explicitly enable direct publishing; approval is provided by the protected GitHub environment. Do not approve the GitHub deployment until npm-side trust is configured. Current npm policy requires the first successful publication within two days of creating a new trust configuration; recreate it if expired.

After the first successful OIDC publish, set npm publishing access to **Require two-factor authentication and disallow tokens**, and revoke unused old automation tokens. This does not disable trusted publishing. Consider a GitHub tag ruleset restricting creation/update/deletion of `v*` tags to release maintainers. No branch or tag ruleset is created by this repository's workflow.

Reference: [npm trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/).

## Release procedure

1. Update package/lock versions together (`npm version minor --no-git-tag-version`, or an explicit version), changelog and release documentation.
2. Run `npm run verify`, `npm run check:browser`, and inspect `artifacts/review-ui/`. Review live-host limitations in `docs/ui-testing.md`.
3. Commit and push `main`. Create an annotated matching tag, for example `git tag -a v0.3.0 -m 'Release 0.3.0'`, then `git push origin v0.3.0`.
4. In GitHub Actions → **Publish to npm**, wait for verification. Review `npm-package` and `release-ui-screenshots`, confirm npm trust setup, then approve the `npm` environment deployment.
5. Confirm publication with `npm view @compn3rd/pi-web-code-review@0.3.0 version dist.integrity` and inspect npm provenance. Publish the GitHub release notes only after success.

A failed run does not mean npm was unchanged: query the exact version before retrying. npm versions are immutable. If already published, do not move/recreate the tag or try overwriting the version; verify the existing integrity/provenance. Otherwise rerun the failed job or manually dispatch the workflow selecting the existing release tag. The workflow intentionally fails rather than silently treating an already-published version as success.

Publishing is separate from PI WEB installation. Do not restart the session daemon as part of this workflow.
