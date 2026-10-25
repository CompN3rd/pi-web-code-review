# Review redesign study

Historical design study, approved for implementation in 0.2.0. User direction: retain Workbench and Focus as a setting, and explore phone UX. The captured Current baseline represents 0.1.2; rerunning that preview now imports the current checkout's component. For production verification and current screenshots, use `scripts/check-browser.mjs` and `docs/screenshots/0.2.0/`. This study is excluded from the npm package.

## Screenshots

All three use the same synthetic unstaged diff, four files, one saved comment and one draft, at 1440px viewport width. Chromium full-page captures; image heights differ with content. The surrounding shell is illustrative, not a live PI WEB screenshot.

- [Current component](screenshots/current.png): actual `ReviewPanel`, with fixture state and backend lifecycle disabled.
- [A — Workbench](screenshots/a.png): persistent file navigation, compact source selector, saved-feedback rail, inline draft.
- [B — Focus](screenshots/b.png): file dropdown, wide diff, inline saved feedback and draft, collapsed review summary.

The preview's Review settings dialog switches layouts without losing the active textarea contents and persists the choice in browser localStorage (`review-study-layout`). Explicit `?design=` links override that preference. This is not wired to PI WEB settings. Other functioning preview controls: the file dropdown, summary/range disclosures, phone files/notes dialogs, code-wrap toggle, cancel, and explanatory alerts. Source/file changes and saving remain illustrative. No persistence, sending or backend calls. Do not treat these previews as functional acceptance tests. Current preview mounts the actual component but should likewise only be used for visual inspection.

## Tradeoffs

A makes navigation and accumulated comments easy to scan but spends horizontal space on two sidebars. B reduces visible chrome and maximizes code width but hides the file list and cross-file feedback behind disclosures. Both remove repeated instructions and keep saved comments distinct from unsaved drafts. Numeric range editing would become a disclosure, not be removed from the implemented design. Compare inputs would appear only when Compare is selected. Errors, stale snapshots, empty/loading states, keyboard behavior and mobile layouts need implementation and acceptance testing after selection.

## Release/API research

Verified npm latest as `@jmfederico/pi-web@1.202610.6`; inspected its packaged `docs/plugins.md` (Host-provided UI styles, CSS files and shadow roots, Semantic appearance properties). Repository dependency remains at its locked 1.202610.3.

Implementation direction:

- Request public `pi-web/stylesheet-integration` capability version 1 and call `createController(this, { sharedUi: true })` once per Lit component constructor.
- Adopt host `ui-toolbar`, `ui-toolbar-group`, `ui-button`, `ui-select`, and `ui-file-row` patterns, retaining plugin-owned events and accessible semantics.
- Use inherited `--pi-*` palette/font tokens; scope any contributed CSS to review-specific selectors. V5 CSS file contributions require emitted CSS assets, not inline text/data URLs.
- Shared root integration also works with browser API v4; v5 is needed for new stylesheet contributions. Styling is explicitly experimental, not a stable visual contract.
- These previews use local CSS approximations and inherited palette tokens, not a running host capability. No private host imports or global host restyling are proposed.

## Reproduce

Serve the repo with Vite (without the production library config) and open `/docs/redesign/?design=current`, `?design=a` or `?design=b`.

`capture.mjs` starts and closes an isolated Vite server on localhost:5198 and captures all three views. Supply a local Playwright module path; it is intentionally not a production dependency:

```sh
node docs/redesign/capture.mjs /absolute/path/to/playwright/index.mjs
```

Capture completed with no browser page errors. Screenshots were visually inspected. Browser assertions cover draft text surviving a layout switch, dialog closure, preference persistence, and no document-level horizontal overflow at 360/390/430px in both layouts with code wrapping on and off. No daemon restart or plugin installation was performed.

## Phone exploration

- [Layout comparison and settings](screenshots/phone-layouts.png)
- [Files, notes and comment editor](screenshots/phone-interactions.png)
- Full-page views: [Workbench](screenshots/a-phone-full.png), [Focus](screenshots/b-phone-full.png)

Both layouts become single-column at 640px. Workbench replaces sidebars with Files and Notes bottom sheets; Focus keeps saved feedback inline and uses a file sheet and collapsible summary. The same preference applies at every width; resizing adapts presentation, not the chosen layout.

Phone-specific decisions:

- Wrap code by default, maintaining one original line number per wrapped row. Toggle off for code-region horizontal scrolling without sideways page scrolling.
- Use at least 44px primary controls and 56px sheet file rows. These larger file rows are a deliberate phone exploration, not the host shared file-row default of 32px.
- Use a 16px draft textarea; keep Save and Cancel adjacent. Hide desktop shortcut hints and reveal numeric range fields on demand, avoiding a shift-click requirement.
- Use native modal dialogs for focus containment, Escape dismissal and inert backgrounds; provide explicit close buttons. A bottom-sheet handle is visual only, not a drag gesture implementation.
- Keep attach separate from sending and exclude unsaved drafts. Do not introduce a fixed footer that could cover code or the editor with a virtual keyboard open.

Remaining acceptance work: real iOS/Android virtual keyboards and visual viewport changes, touch/assistive technology testing, tappable line selection, meaningful navigation between files, active-file/range/scroll preservation across layout changes, all error/loading/empty states, live host settings integration, and v5 shared styling. Captures use desktop Chromium at phone viewport sizes, not real-device emulation. Preview chrome at the top is not proposed production UI.

