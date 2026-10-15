import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { Window } from "happy-dom";
import { IDBFactory } from "fake-indexeddb";

// Consume existing artifacts, optionally from an extracted tarball. Never rebuild here.
const root = resolve(process.argv[2] ?? ".");
const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
assert.equal(manifest.name, "@compn3rd/pi-web-code-review");
assert.equal(manifest.version, "0.1.1");
assert.equal(manifest.publishConfig.access, "public");
assert.notEqual(manifest.private, true);
const entry = manifest.piWeb.plugins[0];
assert.equal(entry.id, "code-review");
assert.equal(entry.machineSpecific, true);
assert(!relative(resolve(root, entry.browserRoot), resolve(root, entry.module)).startsWith(".."));
assert(relative(resolve(root, entry.browserRoot), resolve(root, entry.serverModule)).startsWith(".."));
const server = (await import(pathToFileURL(resolve(root, entry.serverModule)).href)).default;
assert.equal(server.apiVersion, 3);
let command;
const serverActivation = await server.activate({ execFile: async (input) => {
  command = input;
  const stdout = input.args.includes("rev-parse")
    ? (input.args.includes("main^{commit}") ? "a" : "b").repeat(40)
    : input.args.includes("merge-base") ? "c".repeat(40) : "a.ts\0";
  return { exitCode: 0, signal: null, stdout, stderr: "", stdoutTruncated: false, stderrTruncated: false };
} });
const workspace = { id: "w", projectId: "p", path: "/workspace", label: "main", isMain: true };
const lifetime = new AbortController();
assert.deepEqual(await serverActivation.peer.request({ workspace, operation: "changes", input: { source: "git-staged" }, signal: lifetime.signal }), ["a.ts"]);
assert.equal(command.cwd, workspace.path);
assert(command.args.includes("--cached"));
assert(command.args.includes("--submodule=short"));
const comparison = await serverActivation.peer.request({ workspace, operation: "compare", input: { source: "git-compare", baseRef: "main", headRef: "HEAD", mode: "merge-base" }, signal: lifetime.signal });
assert.equal(comparison.base, "c".repeat(40));
assert.equal(comparison.head, "b".repeat(40));
assert.deepEqual(await serverActivation.peer.request({ workspace, operation: "changes", input: { source: "git-compare", comparison }, signal: lifetime.signal }), ["a.ts"]);
assert(command.args.includes(comparison.base));
assert(command.args.includes(comparison.head));

const window = new Window();
Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
for (const key of ["window", "document", "customElements", "HTMLElement", "Document", "ShadowRoot", "CSSStyleSheet", "localStorage"]) {
  Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? window : window[key] });
}
try {
  const { html, svg, render } = await import("lit");
  const browser = (await import(pathToFileURL(resolve(root, entry.module)).href)).default;
  assert.equal(browser.apiVersion, 4);
  const activation = await browser.activate({ html, svg, runtimePluginId: "smoke", pluginId: "smoke", signal: new AbortController().signal, lifetimeSignal: lifetime.signal });
  const contribution = activation.contributions.workspacePanels[0];
  const context = {
    machine: { id: "local", name: "Local", kind: "local" }, workspace,
    files: { listFiles: async () => ({ entries: [], truncated: false }) },
    host: { requestRender() {} },
  };
  const host = window.document.createElement("div"); window.document.body.append(host);
  render(contribution.render(context), host);
  await host.firstElementChild.store.load(JSON.stringify([context.machine.id, workspace.projectId, workspace.id]));
  await host.firstElementChild.updateComplete;
  await window.happyDOM.waitUntilComplete();
  assert.equal(host.firstElementChild.shadowRoot.querySelector('[role="alert"]'), null);
  assert(host.firstElementChild.shadowRoot.textContent.includes("Saved comments (0)"));
  lifetime.abort();
  activation.dispose(new AbortController().signal);
  assert.equal(host.firstElementChild, null);
  console.log("Standalone browser/server artifact smoke passed.");
} finally {
  lifetime.abort();
  await window.happyDOM.close();
}
