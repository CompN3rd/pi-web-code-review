# Changelog

## 0.1.1 — prepared release

Package: **`@compn3rd/pi-web-code-review`** (public npm scope).

### Added

- **Compare revisions** source for reviewing accumulated changes across commits or branches, with editable base/target revisions.
- Merge-base (`A...B`) branch review and direct (`A..B`) commit-tree comparisons, defaulting to `main` → `HEAD`.
- Frozen commit endpoints in file requests, saved comments, and feedback labels; editing reopens the original comparison even after branch tips move.
- Real-Git coverage for divergent branches, dirty-index/worktree exclusion, moving refs, and direct multi-commit comparisons, plus browser cancellation and comment-restoration tests.

### Changed

- Prepare publication under the `@compn3rd` scope instead of the unscoped package name. Once published, install with `npm:@compn3rd/pi-web-code-review` in PI WEB's Pi packages settings.
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

This is release preparation only. No npm publication, GitHub release, host installation, or daemon restart is performed by these changes.
