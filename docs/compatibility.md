# Release compatibility and validation

## 0.2.0 target

Checked published **`@jmfederico/pi-web@1.202610.6`**, including its packaged `docs/plugins.md` and public browser/server declarations. The supported host minimum is now **1.202610.6**. The lockfile records the concrete development dependency. Compatibility with future releases is not implied by these checks.

## Integration

- Browser entrypoint migrated from API **v4 to v5**.
- Declares the public **`pi-web/stylesheet-integration` v1** capability, resolves it in `start`, and installs one Lit controller per panel with `{ sharedUi: true }`. The host owns stylesheet adoption and cleanup on disconnect/reconnect. Missing or malformed capability values fail explicitly.
- Uses shared `ui-button`, `ui-select`, `ui-toolbar` and `ui-file-row` patterns with component-owned responsive CSS and inherited `--pi-*` colour/font tokens. No private host imports, global CSS patches or stylesheet-text capability are used. Styling remains experimental upstream and must be rechecked on upgrades.
- Server entry remains API **v3**, which `1.202610.6` still supports (with an upstream deprecation diagnostic). Its workspace-scoped, read-only Git operations are unchanged. There is no need to accept new machine/project scopes for this UI release.
- Composer-chip ownership, acceptance callbacks, storage transactions, comparison endpoints, plugin ID and comment schema are unchanged. There is no comment-data migration for 0.2.0.
- Layout/wrapping preferences use a separate browser-local key, `pi-web-code-review:preferences:v1`. Corrupt or unavailable preferences fall back safely. Write failures report that the choice applies to the current panel only; they do not block comment storage.
- UI controls are implemented by this plugin. Shared styles do not supply event handling, selection or ARIA semantics. Native modal dialogs supply modal background exclusion and Escape handling.

## Automated results

| Check | Result |
| --- | --- |
| Typecheck and typed ESLint | Passed |
| Unit/DOM/real-Git tests | Passed: 7 files, 99 tests |
| Browser/server build | Passed |
| Unpacked artifact smoke | Passed |
| Actual `npm pack` and extracted-package smoke | Passed |
| Production-bundle Chromium acceptance | Passed |
| Dependency audit | 0 known vulnerabilities |

Browser checks exercise dark/light palettes at desktop width; 360/390/430px viewports with both layouts and wrapping on/off; absence of page-level horizontal overflow; draft retention through layout changes; preference persistence (DOM tests); file/notes/settings dialogs; keyboard exclusion of inert background controls; numeric range editing; mocked chip attachment without clearing the draft; stale-draft save prevention after source changes; and stylesheet-controller connection/disconnection. The browser harness consumes the built `dist/browser/index.js` artifact, not the visual prototype.

The artifact harness uses mocked host contexts and DOM/IndexedDB adapters. The Chromium harness uses native browser storage and the production plugin with a sample backend and a mock stylesheet capability; it does not reproduce the running host's shared CSS bundle. Screenshots under `docs/screenshots/0.2.0/` document those limits.

## Follow-up acceptance

- Live-host registration and shared stylesheet/theme adoption, including theme changes and narrow desktop panels.
- Real iOS/Android keyboards, viewport changes, touch selection and assistive technology.
- Successful/failed/chips-only sends, steer/follow-up, in-flight replacement, two-tab acknowledgements, real storage failures and remote-machine scoping. The automated ownership/storage regressions pass, but do not establish live end-to-end acceptance.

See the [composer checklist](composer-design.md#release-gate). These live checks remain follow-up work under the existing publication policy. No live plugin installation, daemon restart or host modification was performed to produce this release.

## Earlier releases

Versions 0.1.1 and 0.1.2 were checked against PI WEB `1.202610.3`, browser API v4 and server API v3. The 0.1.2 inline-editor redesign passed 84 tests. Historical [before](screenshots/review-before.png) and [after](screenshots/review-after.png) captures are standalone previews, not live-host screenshots.
