# Latest-release compatibility check

## Target

Checked npm's latest published `@jmfederico/pi-web`: **1.202610.3**, source revision `29f0ace6d955a458a947bb0f03673fa069afb8da`.

References:

- [Release changelog](https://github.com/jmfederico/pi-web/blob/29f0ace6d955a458a947bb0f03673fa069afb8da/CHANGELOG.md)
- [Version-matched plugin guide](https://github.com/jmfederico/pi-web/blob/29f0ace6d955a458a947bb0f03673fa069afb8da/docs/plugins.md)
- Public browser/server declarations in the installed npm package, resolved through `@jmfederico/pi-web/plugin-api` and `@jmfederico/pi-web/server-plugin-api`.

## Integration findings

No production API migration was required for this release:

- Composer chips shipped in **1.202610.2**. `PluginPromptChip`, optional `setChip`/`removeChip`, silent programmatic withdrawal, and `onRemove("user" | "submitted")` match the plugin's implementation. Submission means server acceptance, not agent completion; failed sends retain chips.
- Browser API **v4** and server API **v3** are unchanged. Workspace file helpers, invalidation, package peers, and bounded `execFile` with `unsetEnv` and operation signals remain supported.
- Removed panel aliases do not affect this plugin: it declares no `routeAliases`/`navigationAliases` and opens its panel with the runtime-qualified contribution ID.
- Full, case-sensitive session IDs are now required. The plugin already uses the full `selectedSession.id`; it does not generate abbreviated session links.
- New selection subscriptions, application panels, metadata, and message actions are optional additions, not required adaptations for the existing Review panel.
- PI WEB's newer Pi SDK dependencies do not require a companion-extension migration here: this plugin uses no Pi SDK imports or companion extension.
- The standalone browser/server manifest follows the published example, keeping server code outside `browserRoot`. Node's declared minimum remains `>=22.19.0`.

The supported dependency range is `>=1.202610.3`; the lockfile records a concrete resolved version. Compatibility was checked against `1.202610.3`, not every later version. One test access was made null-safe because panel `state` is optional in the public contract. No production API migration was needed. The subsequent `0.1.1` patch adds the Review icon and lint cleanup described below and in the [changelog](../CHANGELOG.md).

## Validation

After `npm ci --ignore-scripts`:

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test` | Passed: 5 files, 64 tests |
| `npm run build` | Passed |
| `npm run check:artifacts` | Passed |
| `npm pack` and smoke check of extracted package | Passed |
| `npm run verify` | Passed |
| Live-host send/acceptance, remote machines, real browser storage failures | Not exercised |

The artifact harness activates the built browser/server entries with mocked host contexts and a DOM/IndexedDB harness. Passing it does not establish live host registration or end-to-end send behavior.

### Lint cleanup

All 38 original lint findings are resolved. Async disposal and callback-mutated ownership checks are preserved through live-state reads. Storage rejects with Error instances (retaining non-Error exceptions as causes), and tests use runtime-checked panel fixtures, real event/request objects, and explicit mock spies. The deliberately unbound IndexedDB method has a local lint exemption because its receiver is explicitly supplied with `.call`.

## Remaining release work

1. Automated verification and packed smoke checks pass after lint cleanup; storage/ownership guards remain in place.
2. Complete the separate live-host checklist in [the release gate](composer-design.md#release-gate), especially successful/failed/chips-only sends, steer/follow-up, replacement during Send, selection changes, two-tab acknowledgements, and remote scoping. The newest host also adds pending-message controls; confirm locally queued messages do not clear saved feedback before server admission.
3. The declared host range is `>=1.202610.3`. Only `1.202610.3` was checked here; later versions are allowed but have not been independently verified.
4. Publication is enabled for the `0.1.1` patch release as `@compn3rd/pi-web-code-review`. The remaining validation is follow-up work; discovered defects will be addressed in patch releases.

No plugin was installed into the live PI WEB instance, no daemon was restarted, and no package was published.
