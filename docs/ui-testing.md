# UI test and review workflow

## Local gate

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm run verify
npm run check:browser
```

On Linux CI, install browser libraries with `npx playwright install --with-deps chromium`.
`check:browser` uses the built production bundle; rebuild after source edits. It now uses the project's pinned Playwright dependency by default (an explicit Playwright module path remains supported).

The GitHub Actions **Review UI** workflow runs the same gates for pull requests, main pushes and manual dispatch. Screenshots are uploaded as `review-ui-screenshots`, including partial output on failure. Locally they are in ignored `artifacts/review-ui/`.

## Automated coverage

- Type checking, lint, unit tests and standalone artifact checks.
- Real Git staged/unstaged tests proving whole-file context uses the correct endpoint, highlights additions/deletions and does not modify the index.
- Server validation rejects malformed/unbounded context arguments.
- Production Chromium checks expand and collapse context, preserve saved-comment markers/fingerprints, and disable context changes during a draft.
- Detach/reattach (Review → chat → Review) retains file and code scroll on desktop, and frozen comparison/file/document scroll on phones.
- Existing workbench/focus, dark/light, 360/390/430px overflow, wrapping, modal keyboard containment, editor range, draft and composer checks remain enabled.

## Human screenshot review

Inspect the artifact images before merging; these are review evidence, not pixel-diff baselines.

1. `expanded-desktop.png` and `expanded-phone.png`: unchanged surrounding lines remain legible, additions/deletions retain distinct backgrounds and signs, and line numbers align.
2. Workbench/focus desktop and light images: context selector is clearly labelled, compact and does not crowd navigation.
3. Phone images: no page-level horizontal overflow, controls remain reachable, dialogs and editor are usable.
4. Check the terminal assertion result as well as screenshots: a screenshot alone cannot prove scroll restoration or saved-comment safety.

## Live-host acceptance before release

The automated fixture supplies a sample peer and host facade. It is not a live PI WEB test. In a safely installed development copy, verify:

- Open a real long diff, scroll vertically/horizontally, switch to chat and back. Repeat with a draft and with Compare. Confirm frozen endpoints do not unexpectedly move.
- Repeat on a phone-sized viewport where the host scroll container, rather than the code pane, scrolls.
- Expand 3 → 20 → 100 → Whole file, then collapse; keep the same changed lines in focus. Try staged-only content, a deleted file, multiple hunks, and a comparison whose target differs from the working tree.
- Verify binary/oversized errors are visible and smaller context can be reopened. Verify Refresh notices actual source changes.
- Reload/switch workspaces and confirm documented scope: navigation state is activation-local; saved comments are durable.

Do not restart a live session daemon as part of automated UI checks. Installing an updated server plugin requires a separately approved, safe restart outside active sessions.
