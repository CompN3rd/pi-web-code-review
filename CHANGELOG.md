# Changelog

## 0.3.0

### Added

- Retain file, frozen comparison, draft, context setting and desktop/mobile scroll when returning from chat to Review in the same workspace.
- Git diff context selector: 3, 20, 100 lines or Whole file, with additions/deletions highlighted and saved-comment fingerprints independent of display context.
- Reproducible production Chromium UI checks, screenshots and a GitHub Actions UI review workflow.
- Approval-gated npm trusted publishing using GitHub OIDC, provenance, SHA-pinned actions and an isolated publish job consuming the tested tarball. No npm token secret is required.
- PI WEB community-discovery keywords (previously committed after 0.2.0 publication).

### Validation and limits

- Typecheck, lint, 109 tests, production build, artifact smoke and Chromium UI checks pass. Navigation state remains in memory, not across reloads/workspace switches.
- Context changes require saving/cancelling drafts first. Binary/oversized sources retain existing limits.
- Runtime dependency audit is clean; the development tree currently reports 5 advisories (3 moderate, 2 high), tracked separately from release runtime dependencies.
- Live-host styling, remote/send acceptance and real-device checks remain outstanding; no daemon restart is performed.

## 0.2.0

### Added

- Switchable **Workbench** and **Focus** layouts in the panel’s **Review settings**, with browser-local layout and code-wrap preferences.
- Workbench file navigation and saved-feedback rail; Focus inline feedback, file switcher and collapsible review summary. Layout changes preserve the active file, range and draft.
- Phone file/notes sheets, touch-sized controls, wrapped code, numeric range disclosure, and responsive source/comparison controls.
- Production-bundle Chromium checks and dark/light desktop/phone screenshots. Regression coverage increases from 84 to 99 tests.

### Changed

- Require PI WEB **>=1.202610.6** and migrate the browser entry to API **v5**.
- Opt into public `stylesheet-integration` v1 with host shared UI primitives and theme-aware, component-scoped CSS. Server API v3 and read-only Git operations are unchanged.
- Compact source selection and move path/help/range details behind disclosures. Keep saved comments and unsaved drafts distinct; attaching still does not send.
- Update Vite/Vitest development dependencies to patched versions; dependency audit is clean.
- Exclude design-study source and prototype assets from the published package; ship production screenshots and user documentation.

### Validation and limits

- Typecheck, lint, 99 tests, builds, unpacked/packed artifact smoke checks, and production-bundle browser checks pass.
- Chromium checks cover both layouts at 360/390/430px, dark/light palettes, wrapping, dialogs, draft preservation, range editing and mocked attachment.
- Live-host shared styling, real phone keyboards and end-to-end send/remote acceptance remain follow-up checks. No daemon restart or installation is part of release preparation.
- Comment schema, IndexedDB data and composer acceptance semantics are unchanged; no comment migration is required.

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
