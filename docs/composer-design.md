# Composer-chip design and release gate

## Target and status

Target the public API on `jmfederico/pi-web` main at `830dc179`, including composer chips introduced in `02d24ec6`. The source imports `PluginPromptChip` directly from `@jmfederico/pi-web/plugin-api`; it does not recreate the missing API through a local shim or access private host code.

The development dependency accepts PI WEB `>=1.202610.3`; compatibility was checked against published `1.202610.3`. Composer chips shipped in `1.202610.2`; the `1.202610.3` public declarations match this design. No speculative version, Git dependency, or local shim is used. Typechecking, all 63 tests, builds, and unpacked/packed artifact smoke checks pass. Full verification remains blocked by lint errors. See [compatibility results](compatibility.md).

The initial `0.1.0` release is enabled for publication. Lint cleanup and live-host checks remain follow-up work rather than publication gates. Live-host runtime testing and installation are still deferred; the checks above validate declarations and standalone artifacts, not end-to-end send admission in a running host.

Reference: [upstream composer documentation](https://github.com/jmfederico/pi-web/blob/830dc179/docs/plugins.md#attach-text-context-to-a-message).

## Ownership

- **ReviewStore** owns durable comments in browser IndexedDB transactions (with one-time, backup-retaining localStorage migration), keyed by machine/project/workspace. A comment is not deleted merely because it was attached to a conversation.
- **ReviewChips** owns staging and callback bookkeeping for the plugin activation, independent of whether the Review panel is mounted. It retains the exact conversation-bound prompt facade used for each attachment, never a live-selection redirect.
- **PI WEB** owns composer chips, send admission, failed-send retention, and callbacks. Staging happens only from the user's **Attach review to composer** action, never from render.
- **ReviewPanel** owns file loading and unsaved edits. It delegates composer lifecycle decisions instead of reaching into the host DOM or sending messages itself.

## One snapshot per workspace/conversation

Attach creates one labeled `Review (N)` chip containing the sorted Markdown for all saved comments in the workspace. The plugin-local chip id is stable for that workspace; the host additionally scopes it by plugin, machine, and conversation. Reattaching replaces the same chip rather than adding duplicates. Individual comments remain editable/removable in the Review panel.

A ready, unarchived conversation in the panel's workspace is required. The facade is already bound to that conversation: no navigation, selection-service shim, cursor manipulation, or clipboard fallback is needed. Hosts without `setChip`/`removeChip` produce an explicit unsupported-host error rather than reverting to the interim insertion implementation.

## Lifecycle

| Event | Intended behavior |
| --- | --- |
| Attach | Read current saved comments; stage a detached snapshot; retain durable data. |
| Panel closes or selection changes | Host retains the chip in its original conversation; the activation retains its callback. |
| User removes the composer chip | Detach only; keep saved comments for editing or reattachment. |
| Send fails or is queued only locally | No submitted callback; chip and saved comments remain available. |
| Server accepts the prompt | `onRemove("submitted")` clears only comments whose stored fields still equal the submitted snapshot. Later edits and new comments survive. |
| A chip is replaced while Send is in flight | An older callback must not retire the replacement or clear the saved feedback for that newer attachment. |
| Save or remove a comment in the Review panel | Withdraw this workspace's staged copies before mutation. Attach the updated review explicitly. If withdrawal fails, block the mutation and show the error. |
| Another tab changes saved review data | Withdraw this activation's copies, even while the panel is closed, and ask for reattachment. A request already in flight may still be accepted; its callback compares against current storage. |
| Clearing submitted data fails | Preserve saved data, report the problem in the panel, and throw for the host's attributed callback logging. The user checks the conversation before reattaching. |
| Browser reload | Host chips are gone; saved comments remain. Open the target conversation and attach again with a fresh facade/callback. |
| Plugin disposal | Close the notification channel/database and attempt silent chip withdrawal; suppress obsolete asynchronous UI work. Already-started durable writes may complete. |

Acceptance means prompt admission by the server, not that the assistant completed its response. There is no automatic resend or inference from the disappearance of prompt text. A submitted callback always uses its captured workspace and snapshot, even after navigation. Attachments in different conversations are independent snapshots; intentionally attaching to multiple conversations can send the feedback more than once.

## Release gate

Current progress against published PI WEB `1.202610.3`:

1. Confirm its public declarations include `PluginPromptChip` and the documented `setChip`/`removeChip` lifecycle. Declare the supported minimum as `>=1.202610.3` and retain a concrete resolved version in the lockfile.
2. Re-read the published contract and reconcile any differences from the recorded main revision. Do not assume main's design is frozen.
3. Run `npm run verify` at the package root, followed by an actual packed-package smoke check. All 63 unit/DOM cases have passed, as have unpacked and packed artifact smoke checks. Fix the 38 lint errors before claiming full `verify` success. The dev-only `fake-indexeddb` factory exercises the actual adapter on two connections, transaction aborts, migration precedence/empty markers, and open retry/late-success cleanup. Dependencies were installed with `--ignore-scripts`; no host installation or daemon restart was performed.
4. In a separate test installation, exercise successful and failed sends, chips-only messages, steer/follow-up, selection changes, repeat attachment during an in-flight send, local edits/deletes, simultaneous two-tab saves/acknowledgements, failed/blocked/corrupt migration, retained legacy backups, persistent storage/acknowledgement warnings across remounts, async navigation/disposal, LAN HTTP without Web Locks, BroadcastChannel failure, Git with `diff.submodule=diff`, reload/restaging, disabled-plugin cleanup, and remote-machine scoping. Confirm the server-accepted callback clears only the correct saved feedback. Do not restart the developer's active session daemon as part of this check.
5. Publication is enabled for version `0.1.0` as `pi-web-code-review`, with PI WEB `>=1.202610.3` supported. Keep outstanding validation documented and address discovered defects in patch releases.

There is no scheduled release watcher or automatic installation/restart associated with this gate.
