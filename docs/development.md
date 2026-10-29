# Developing the standalone plugin

All package source, tests, and configuration live at this repository's root. The package is independent of PI WEB's bundled plugins, test command, and npm release; no PI WEB source checkout is required.

This repository starts from the plugin snapshot in [CompN3rd/pi-web at `d0c7a212`](https://github.com/CompN3rd/pi-web/tree/d0c7a212/plugins/code-review). Earlier development history remains there; PI WEB host code is not included here.

## Verification status

The development dependency targets PI WEB `^1.202610.6`, with a concrete lockfile resolution. The browser entry uses API v5 and public stylesheet-integration v1; the unchanged server entry uses supported API v3. There are no local replacement declarations. Typechecking, all 109 tests, the build, and unpacked/packed artifact smoke checks pass. Full `verify` and standalone production-browser checks pass; live-host testing is still pending. See [compatibility results](compatibility.md).

The `0.3.0` release is enabled for publication with live-host testing tracked as follow-up work in the [validation checklist](composer-design.md#release-gate). Reproduce validation with:

```sh
npm ci --ignore-scripts
npm run verify
npm pack --dry-run
```

`verify` runs strict typechecking, typed ESLint, Vitest, the standalone build, and browser/server artifact smoke checks. `npm run check:artifacts` consumes already-built output without rebuilding; `node scripts/check-artifacts.mjs /path/to/extracted/package` checks a packed copy using this checkout's DOM harness.

Prepared cases cover actual adapter serialization on two IndexedDB connections, aborted-write durability, one-time migration and empty migration markers, legacy-backup retention, corrupt/failed migration, failed-open retry and late blocked-open cleanup, captured chip ownership, stale async reads, disposal, user removal versus server acceptance, replacement during Send, unchanged-snapshot deletion, cross-tab withdrawal/badge refresh, persistent storage/acknowledgement warnings across remounts, and Git's `--submodule=short` override. `fake-indexeddb` is dev-only and injected through the native `IDBFactory` boundary; DOM tests retain the per-file happy-dom harness. These tests and the existing source-coordinate, Markdown, Git, and storage cases have passed against the released declarations. Mock/DOM coverage does not replace live-host acceptance testing.

## Production browser checks

Playwright is a development dependency. Install its Chromium browser, then run:

```sh
npx playwright install chromium
npm run build
npm run check:browser
```

This starts a temporary localhost Vite server, loads the built plugin with native browser storage and sample host/backend adapters, checks the responsive interactions, captures `artifacts/review-ui/`, then closes browser and server. It never starts PI WEB or restarts its daemon. The host stylesheet capability is mocked; test shared CSS and real mobile keyboards separately. The earlier `docs/redesign/` study is historical and excluded from npm; the production harness under `scripts/browser/` is the acceptance source.

See [UI testing](ui-testing.md) for the screenshot-review checklist and [releasing](releasing.md) for approval-gated npm publishing.

## Boundaries

- The frontend stores workspace-scoped comments and delegates staging/acknowledgement to `ReviewChips`. Only public `prompt.setChip`/`prompt.removeChip` methods are used for handoff; prompt insertion and the provisional selection-service shim have been removed.
- The backend accepts only read-only `compare`, `changes`, and `diff` operations, runs argv-based Git through the host's bounded executor with the request signal, and uses the host-resolved workspace. Literal pathspecs, disabled external diff/textconv drivers, forced short submodule diffs, and output/path bounds keep this surface narrow.
- The Markdown renderer is adapted from PI WEB's MIT-licensed Captain's Log example. It renders known lexer tokens through Lit text bindings, not unsafe HTML.
- Browser dependencies are bundled under `dist/browser`; server JavaScript remains outside that public directory. The whole plugin can be built separately from the host after the dependency gate is satisfied.

Version `0.3.0` is packaged for public npm distribution as `@compn3rd/pi-web-code-review`. Release publication is separate from host installation and activation. Do not publish the PI WEB host to ship this plugin.
