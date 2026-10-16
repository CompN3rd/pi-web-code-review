# Changelog

## 0.1.2 — 2026-10-16

### Changed

- Open and focus comment editors directly beneath the selected code line, inside the file viewer, instead of below the entire file.
- Use a full-width header with saved-comment and unsaved-draft status, and move **Attach review to composer** to the header.
- Place file navigation beside the viewer on wide panels and stack it above the viewer on narrow panels.
- Highlight the active file and improve empty states, keyboard hints, focus indicators, and source-control layout.
- Keep changed-snapshot drafts accessible outside the code view without losing their text or allowing an invalid save.

### Validation and compatibility

- Add regression tests for inline editor placement, focus, header action placement, active-file state, and changed-snapshot draft preservation (84 tests total).
- Capture browser-rendered before/after screenshots with the same sample file and draft; these are standalone previews, not live-host acceptance tests.
- No host API, storage format, or server behavior changes. Requirements remain PI WEB `>=1.202610.3` and Node.js `>=22.19.0`.
- Live-host acceptance and remote-machine testing remain outstanding; see [compatibility results](docs/compatibility.md).

## 0.1.1 — 2026-10-15

Package: **`@compn3rd/pi-web-code-review`** (public npm scope).

### Added

- **Compare revisions** source for reviewing accumulated changes across commits or branches, with editable base/target revisions.
- Merge-base (`A...B`) branch review and direct (`A..B`) commit-tree comparisons, defaulting to `main` → `HEAD`.
- Frozen commit endpoints in file requests, saved comments, and feedback labels; editing reopens the original comparison even after branch tips move.
- Real-Git coverage for divergent branches, dirty-index/worktree exclusion, moving refs, and direct multi-commit comparisons, plus browser cancellation and comment-restoration tests.

### Changed

- Distribute under the `@compn3rd` scope instead of the unscoped package name. Install with `npm:@compn3rd/pi-web-code-review` in PI WEB's Pi packages settings.
- Use a theme-aware magnifying glass icon for the Review panel.
- Update the supported PI WEB minimum to `1.202610.3`, matching the published composer-chip API.
- Resolve all 38 typed lint findings while retaining asynchronous disposal and attachment-ownership guards.
- Normalize non-Error storage mutation failures to Errors with the original exception retained as the cause.
- Strengthen test fixtures and add coverage for the panel icon and non-Error mutation failures.

### Compatibility and validation

- Requires PI WEB `>=1.202610.3` and Node.js `>=22.19.0`.
- Plugin ID, review storage keys, and IndexedDB database name remain unchanged; no review data migration is introduced by the npm scope change.
- Automated verification covers typechecking, lint, 82 tests, browser/server builds, and unpacked/packed artifact smoke checks.
- Live-host send/acceptance and remote-machine acceptance testing remain pending; see [compatibility results](docs/compatibility.md).

Installation and live-host acceptance testing are separate from publication. This release does not install the plugin into a running host or restart its daemon.
