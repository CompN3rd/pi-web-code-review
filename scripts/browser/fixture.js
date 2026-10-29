import { html, svg, render } from 'lit';
import plugin from '../../dist/browser/index.js';

const files = ['src/browser/chips.ts', 'src/browser/panel.ts', 'test/chips.test.ts', 'docs/usage.md'];
const diff = `@@ -84,8 +84,14 @@ async attach(context)
   const comments = await store.load(key);
   if (comments.length === 0) return;
 
-  await prompt.insertText(reviewMarkdown(comments));
+  const revision = selectionRevision;
+  if (!isCurrent()) return;
+  await prompt.setChip({
+    id: reviewChipId(key),
+    label: \`Review (\${comments.length})\`,
+    payload: freezeReview(comments),
+  });
 
   // Keep saved feedback until server acceptance.
   pending.set(key, { revision, comments });
 }
`;
const expandedDiff = `@@ -1,91 +1,97 @@\n${Array.from({ length: 83 }, (_, i) => ` // surrounding context ${i + 1}\n`).join('')}${diff.split('\n').slice(1).join('\n')}`;
const lifetime = new AbortController();
const activation = await plugin.activate({ apiVersion: 5, pluginId: 'review-acceptance', runtimePluginId: 'review-acceptance', html, svg, signal: lifetime.signal, lifetimeSignal: lifetime.signal });
let styleRoots = 0;
await activation.start({ signal: lifetime.signal, capabilities: { resolve: capability => capability.parse({
  createController(host, options) {
    if (!options.sharedUi) throw new Error('Missing shared UI opt-in');
    // Exercise Lit lifecycle integration. The host's shared stylesheet is not replicated here.
    host.addController({ hostConnected() { styleRoots++; }, hostDisconnected() { styleRoots--; } });
  },
  registerRoot() { return () => {}; }, subscribe() { return () => {}; },
}) } });
const workspace = { id: 'w', projectId: 'p', path: '/sample', label: 'main', isMain: true };
const machine = { id: 'local', name: 'Local', kind: 'local' };
let attachedChip;
const context = {
  workspace, machine, state: { selectedWorkspace: workspace, selectedMachine: machine, selectedSession: { id: 'session', cwd: '/sample', archived: false, pending: false } },
  files: { capabilityVersion: 1, listFiles: async () => ({ entries: files.map(path => ({ name: path, path, type: 'file' })), truncated: false }), readFile: async path => ({ path, content: 'one\ntwo\nthree\n', binary: false, truncated: false }) },
  peer: { request: async (operation, input) => operation === 'changes' ? files : operation === 'diff' ? (input.context === 'all' || input.context > 3 ? expandedDiff : diff) : { baseRef: input.baseRef, headRef: input.headRef, mode: input.mode, base: 'a'.repeat(40), head: 'b'.repeat(40) } },
  host: { requestRender() {} },
  prompt: { setChip(chip) { attachedChip = chip; }, removeChip() { attachedChip = undefined; } },
};
render(activation.contributions.workspacePanels[0].render(context), document.querySelector('#app'));
window.fixture = { hide() { render(null, document.querySelector('#app')); }, show() { render(activation.contributions.workspacePanels[0].render(context), document.querySelector('#app')); }, get panel() { return document.querySelector('#app').firstElementChild; }, get attachedChip() { return attachedChip; }, get styleRoots() { return styleRoots; }, context, dispose() { lifetime.abort(); activation.dispose(new AbortController().signal); } };
