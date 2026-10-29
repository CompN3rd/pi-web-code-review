// @vitest-environment happy-dom
import { html, render, svg } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FileContentResponse, PluginActivationResultV5, PluginPromptChip } from "@jmfederico/pi-web/plugin-api";
import plugin from "../src/browser/index.js";
import { ReviewPanel } from "../src/browser/panel.js";
import { preferencesKey } from "../src/browser/preferences.js";
import { stylesheetIntegration } from "../src/browser/styling.js";
import { renderReviewMarkdown } from "../src/browser/markdown.js";
import { ReviewStore, storagePrefix, workspaceKey, type Comment } from "../src/browser/model.js";
import { context, savedComment } from "./context.js";
import { IDBFactory } from "fake-indexeddb";
import { deferred } from "./storageSupport.js";
import { record, type GitComparison } from "../src/protocol.js";

const cleanups: (() => void)[] = [];
class TestChannel {
  static peers = new Set<TestChannel>();
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  constructor(readonly name: string) { TestChannel.peers.add(this); }
  postMessage(data: unknown) {
    for (const peer of TestChannel.peers) {
      if (peer !== this && peer.name === this.name) queueMicrotask(() => { peer.onmessage?.(new MessageEvent("message", { data })); });
    }
  }
  close() { TestChannel.peers.delete(this); this.onmessage = null; }
}
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("BroadcastChannel", TestChannel);
});
afterEach(() => {
  document.body.replaceChildren(); localStorage.clear();
  for (const cleanup of cleanups.splice(0)) cleanup();
  TestChannel.peers.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function required<T>(value: T | undefined | null): T {
  if (value == null) throw new Error("Missing UI fixture"); return value;
}
function reviewPanel(host: HTMLElement): ReviewPanel {
  const panel = host.firstElementChild;
  if (!(panel instanceof ReviewPanel)) throw new Error("Review panel missing");
  return panel;
}
function button(panel: ReviewPanel, text: string): HTMLButtonElement {
  return required([...panel.shadowRoot?.querySelectorAll("button") ?? []].find((candidate) => candidate.textContent.trim() === text));
}
async function mount(ctx = context()) {
  const lifetime = new AbortController();
  const activation: PluginActivationResultV5 = await plugin.activate({ apiVersion: 5, pluginId: "review", runtimePluginId: "review", html, svg, signal: new AbortController().signal, lifetimeSignal: lifetime.signal });
  const createController = vi.fn();
  await activation.start?.({ signal: lifetime.signal, capabilities: { resolve: (capability) => capability.parse({ createController, registerRoot: vi.fn(), subscribe: vi.fn() }) } });
  const contribution = required(activation.contributions.workspacePanels?.[0]);
  const host = document.createElement("div"); document.body.append(host);
  render(contribution.render(ctx), host);
  const panel = host.firstElementChild;
  if (!(panel instanceof ReviewPanel)) throw new Error("Review panel missing");
  cleanups.push(() => { lifetime.abort(); void activation.dispose?.(new AbortController().signal); });
  await vi.waitFor(() => { expect(button(panel, "a.ts")).toBeDefined(); });
  return { panel, ctx, host, contribution, lifetime, activation, createController };
}
async function open(panel: ReviewPanel) {
  await vi.waitFor(() => { expect(button(panel, "a.ts")).toBeDefined(); });
  button(panel, "a.ts").click();
  await vi.waitFor(() => { expect(panel.shadowRoot?.querySelector('[aria-label="Current line 1"]')).not.toBeNull(); });
}
function chooseSource(panel: ReviewPanel, value: string): void {
  required(panel.shadowRoot?.querySelector<HTMLButtonElement>(`[data-source="${value}"]`)).click();
}
function submitComparison(panel: ReviewPanel): void {
  required(panel.shadowRoot?.querySelector('form[aria-label="Compare revisions"]')).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}
async function editBody(panel: ReviewPanel, body: string) {
  const textarea = required(panel.shadowRoot?.querySelector<HTMLTextAreaElement>('.editor textarea'));
  textarea.value = body; textarea.dispatchEvent(new Event("input")); await panel.updateComplete;
}

async function setLayout(panel: ReviewPanel, layout: "focus" | "workbench") {
  button(panel, "Review settings").click(); await panel.updateComplete;
  required(panel.shadowRoot?.querySelector<HTMLInputElement>(`input[name="layout"][value="${layout}"]`)).click();
  await panel.updateComplete;
  button(panel, "Apply layout").click(); await panel.updateComplete;
}

describe("standalone Review panel", () => {
  it("retains file, draft and scroll when leaving and returning to Review", async () => {
    const { panel, host, contribution, ctx } = await mount(); await open(panel);
    required(panel.shadowRoot?.querySelector<HTMLButtonElement>('[aria-label="Current line 1"]')).click();
    await panel.updateComplete; await editBody(panel, "Keep this draft");
    const code = required(panel.shadowRoot?.querySelector(".code"));
    code.scrollTop = 42; code.scrollLeft = 12; code.dispatchEvent(new Event("scroll"));
    render(null, host);
    code.scrollTop = 0; code.scrollLeft = 0;
    render(contribution.render(ctx), host); await panel.updateComplete;
    expect(panel.shadowRoot?.querySelector(".file-heading h3")?.textContent).toBe("a.ts");
    expect(panel.shadowRoot?.querySelector<HTMLTextAreaElement>(".editor textarea")?.value).toBe("Keep this draft");
    expect(code.scrollTop).toBe(42); expect(code.scrollLeft).toBe(12);
  });

  it("requires v5 stylesheet integration and installs shared styles once per panel", async () => {
    const { panel, createController, host, contribution, ctx } = await mount();
    expect(plugin.apiVersion).toBe(5);
    expect(plugin.requires).toContain(stylesheetIntegration);
    expect(createController).toHaveBeenCalledExactlyOnceWith(panel, { sharedUi: true });
    await setLayout(panel, "focus");
    render(null, host); render(contribution.render(ctx), host); await panel.updateComplete;
    expect(createController).toHaveBeenCalledOnce();
    expect(() => stylesheetIntegration.parse({})).toThrow("stylesheet-integration");
  });
  it("switches layouts without replacing the editor or losing file, range, body or scroll", async () => {
    const { panel } = await mount(); await open(panel);
    required(panel.shadowRoot?.querySelector<HTMLButtonElement>('[aria-label="Current line 1"]')).click(); await panel.updateComplete;
    required(panel.shadowRoot?.querySelector<HTMLButtonElement>('[aria-label="Current line 3"]')).dispatchEvent(new MouseEvent("click", { shiftKey: true }));
    await panel.updateComplete; await editBody(panel, "Keep draft and range");
    const editor = required(panel.shadowRoot?.querySelector<HTMLTextAreaElement>(".editor textarea"));
    const code = required(panel.shadowRoot?.querySelector(".code")); code.scrollTop = 30;
    await setLayout(panel, "focus");
    expect(panel.shadowRoot?.querySelector(".review-panel.focus")).not.toBeNull();
    expect(panel.shadowRoot?.querySelector(".editor textarea")).toBe(editor);
    expect(editor.value).toBe("Keep draft and range");
    expect(panel.shadowRoot?.querySelector(".editor strong")?.textContent).toContain("a.ts:1-3");
    expect(panel.shadowRoot?.querySelector(".code")).toBe(code);
    expect(code.scrollTop).toBe(30);
    expect(panel.shadowRoot?.querySelector(".file-heading h3")?.textContent).toBe("a.ts");
    expect(panel.shadowRoot?.querySelector("dialog")?.open).toBe(false);
    expect(JSON.parse(localStorage.getItem(preferencesKey) ?? "null")).toEqual({ layout: "focus", wrapCode: true });
    const other = await mount();
    expect(other.panel.shadowRoot?.querySelector(".review-panel.focus")).not.toBeNull();
  });
  it("cancels settings without changing layout and persists the wrap toggle", async () => {
    const { panel } = await mount();
    button(panel, "Review settings").click(); await panel.updateComplete;
    required(panel.shadowRoot?.querySelector<HTMLInputElement>('input[value="focus"]')).click(); await panel.updateComplete;
    required(panel.shadowRoot?.querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')).click(); await panel.updateComplete;
    expect(panel.shadowRoot?.querySelector(".review-panel.workbench")).not.toBeNull();
    const wrap = required(panel.shadowRoot?.querySelector<HTMLInputElement>('.wrap-control input')); wrap.click(); await panel.updateComplete;
    expect(panel.shadowRoot?.querySelector(".review-panel.wrap")).toBeNull();
    expect(JSON.parse(localStorage.getItem(preferencesKey) ?? "null")).toEqual({ layout: "workbench", wrapCode: false });
  });
  it("reports settings storage failure without discarding the applied layout or draft", async () => {
    const { panel } = await mount(); await open(panel);
    required(panel.shadowRoot?.querySelector<HTMLButtonElement>('[aria-label="Current line 1"]')).click(); await panel.updateComplete;
    await editBody(panel, "Still here");
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => { throw new Error("blocked"); }, clear: vi.fn() });
    await setLayout(panel, "focus");
    expect(panel.shadowRoot?.querySelector('[role="alert"]')?.textContent).toContain("could not be saved");
    expect(panel.shadowRoot?.querySelector<HTMLTextAreaElement>(".editor textarea")?.value).toBe("Still here");
    expect(panel.shadowRoot?.querySelector(".review-panel.focus")).not.toBeNull();
  });
  it("opens the file sheet, navigates directories, then closes on file selection", async () => {
    const ctx = context();
    ctx.files.listFiles = vi.fn().mockImplementation((path: string) => Promise.resolve({ entries: path === "src" ? [{ name: "a.ts", path: "src/a.ts", type: "file" }] : [{ name: "a.ts", path: "a.ts", type: "file" }, { name: "src", path: "src", type: "directory" }] }));
    const { panel } = await mount(ctx);
    required(panel.shadowRoot?.querySelector<HTMLButtonElement>(".file-switch")).click(); await panel.updateComplete;
    const dialog = required(panel.shadowRoot?.querySelector("dialog")); expect(dialog.open).toBe(true);
    required([...dialog.querySelectorAll("button")].find(item => item.textContent.includes("📁 src"))).click();
    await vi.waitFor(() => { expect(dialog.textContent).toContain("Parent directory"); });
    expect(dialog.open).toBe(true);
    required([...dialog.querySelectorAll("button")].find(item => item.textContent.trim() === "a.ts")).click();
    await vi.waitFor(() => { expect(panel.shadowRoot?.querySelector(".file-heading h3")?.textContent).toBe("src/a.ts"); });
    expect(dialog.open).toBe(false);
  });
  it("opens saved notes in a modal and returns to a valid editor", async () => {
    const { panel } = await mount(); await open(panel);
    required(panel.shadowRoot?.querySelector<HTMLButtonElement>('[aria-label="Current line 1"]')).click(); await panel.updateComplete;
    await editBody(panel, "Saved note"); button(panel, "Save comment").click();
    await vi.waitFor(() => { expect(panel.shadowRoot?.querySelector("article")).not.toBeNull(); });
    required(panel.shadowRoot?.querySelector<HTMLButtonElement>(".mobile-notes")).click(); await panel.updateComplete;
    const dialog = required(panel.shadowRoot?.querySelector("dialog")); expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain("Saved note");
    required([...dialog.querySelectorAll("button")].find(item => item.textContent.trim() === "Edit comment")).click();
    await vi.waitFor(() => { expect(button(panel, "Save comment").disabled).toBe(false); });
    expect(dialog.open).toBe(false);
    expect(panel.shadowRoot?.querySelector<HTMLTextAreaElement>(".editor textarea")?.value).toBe("Saved note");
  });
  it("keeps a detached draft safe when navigating to the next file", async () => {
    const ctx = context();
    ctx.files.listFiles = vi.fn().mockResolvedValue({ entries: [{ path: "a.ts", name: "a.ts", type: "file" }, { path: "b.ts", name: "b.ts", type: "file" }] });
    const { panel } = await mount(ctx); await open(panel);
    required(panel.shadowRoot?.querySelector<HTMLButtonElement>('[aria-label="Current line 1"]')).click(); await panel.updateComplete;
    await editBody(panel, "Belongs to a.ts");
    required(panel.shadowRoot?.querySelector<HTMLButtonElement>('[aria-label="Next file"]')).click();
    await vi.waitFor(() => { expect(panel.shadowRoot?.querySelector(".file-heading h3")?.textContent).toBe("b.ts"); });
    expect(button(panel, "Save comment").disabled).toBe(true);
    expect(panel.shadowRoot?.querySelector<HTMLTextAreaElement>(".editor textarea")?.value).toBe("Belongs to a.ts");
    required(panel.shadowRoot?.querySelector<HTMLButtonElement>('[aria-label="Previous file"]')).click();
    await vi.waitFor(() => { expect(button(panel, "Save comment").disabled).toBe(false); });
  });
  it("opens and focuses the draft directly beneath the selected code line", async () => {
    const { panel } = await mount(); await open(panel);
    const line = required(panel.shadowRoot?.querySelector<HTMLButtonElement>('[aria-label="Current line 1"]'));
    line.click(); await panel.updateComplete;
    const editor = required(panel.shadowRoot?.querySelector('.code .editor'));
    expect(line.closest('.row')?.nextElementSibling).toBe(editor);
    expect(panel.shadowRoot?.activeElement).toBe(editor.querySelector('textarea'));
    expect(panel.shadowRoot?.querySelectorAll('.editor')).toHaveLength(1);
    expect(button(panel, "Attach review to composer").closest('header')).not.toBeNull();
    expect(button(panel, "a.ts").getAttribute('aria-current')).toBe('page');
    await editBody(panel, "Inline draft");
    button(panel, "Cancel edit").click(); await panel.updateComplete;
    expect(panel.shadowRoot?.querySelector('.editor')).toBeNull();
  });
  it("keeps a changed-snapshot draft accessible outside the code without losing text", async () => {
    const { panel, ctx } = await mount(); await open(panel);
    required(panel.shadowRoot?.querySelector<HTMLButtonElement>('[aria-label="Current line 1"]')).click();
    await panel.updateComplete; await editBody(panel, "Keep this draft");
    ctx.files.readFile = vi.fn().mockResolvedValue({ content: "changed\n", binary: false, truncated: false });
    button(panel, "Refresh").click();
    await vi.waitFor(() => { expect(panel.shadowRoot?.querySelector('.code .editor')).toBeNull(); });
    expect(panel.shadowRoot?.querySelector<HTMLTextAreaElement>('.viewer .editor textarea')?.value).toBe('Keep this draft');
    expect(button(panel, "Save comment").disabled).toBe(true);
  });
  it("provides a theme-aware magnifying glass icon for the Review tab", async () => {
    const { contribution } = await mount();
    const host = document.createElement("div");
    render(contribution.icon, host);
    const icon = required(host.querySelector("svg"));
    expect(contribution.title).toBe("Review");
    expect(icon.getAttribute("stroke")).toBe("currentColor");
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect(icon.querySelector("circle")).not.toBeNull();
    expect(icon.querySelector("path")).not.toBeNull();
  });
  it("reviews a frozen comparison, changes ranges, and restores saved comment endpoints for editing", async () => {
    const original: GitComparison = { baseRef: "main", headRef: "HEAD", mode: "merge-base", base: "a".repeat(40), head: "b".repeat(40) };
    let resolved = original;
    const peer = vi.fn().mockImplementation((operation: string) => Promise.resolve(operation === "compare" ? { ...resolved }
      : operation === "changes" ? ["compared.ts"] : "@@ -1 +1 @@\n-old\n+new\n"));
    const ctx = context(); ctx.peer = { request: peer };
    const { panel } = await mount(ctx);
    chooseSource(panel, "git-compare");
    await vi.waitFor(() => { expect(button(panel, "compared.ts")).toBeDefined(); });
    expect(peer).toHaveBeenCalledWith("compare", { source: "git-compare", baseRef: "main", headRef: "HEAD", mode: "merge-base" }, expect.anything());
    button(panel, "compared.ts").click();
    await vi.waitFor(() => { expect(panel.shadowRoot?.querySelector('[aria-label="Current line 1"]')).not.toBeNull(); });
    required(panel.shadowRoot?.querySelector<HTMLButtonElement>('[aria-label="Current line 1"]')).click(); await panel.updateComplete;
    expect(panel.shadowRoot?.querySelector(".add code")?.textContent).toBe("new");
    expect(panel.shadowRoot?.querySelector(".add .sign")?.textContent).toBe("+");
    await editBody(panel, "Across several commits"); button(panel, "Save comment").click();
    await vi.waitFor(() => { expect(panel.shadowRoot?.querySelector("article")).not.toBeNull(); });
    expect((await required(panel.store).load(workspaceKey(ctx)))[0]?.comparison).toEqual(original);
    const base = required(panel.shadowRoot?.querySelector<HTMLInputElement>('input[name="base"]'));
    base.value = "HEAD~3"; base.dispatchEvent(new Event("input"));
    const mode = required(panel.shadowRoot?.querySelector<HTMLSelectElement>('select[name="mode"]'));
    mode.value = "direct"; mode.dispatchEvent(new Event("change"));
    resolved = { ...original, baseRef: "HEAD~3", mode: "direct", base: "c".repeat(40) };
    submitComparison(panel); await panel.updateComplete;
    await vi.waitFor(() => {
      expect(button(panel, "compared.ts").disabled).toBe(false);
      expect(panel.shadowRoot?.querySelector(".file-list summary")?.textContent).toContain("HEAD~3");
    });
    expect(peer).toHaveBeenCalledWith("compare", { source: "git-compare", baseRef: "HEAD~3", headRef: "HEAD", mode: "direct" }, expect.anything());
    button(panel, "compared.ts").click();
    await vi.waitFor(() => { expect(panel.shadowRoot?.querySelector(".stale")).not.toBeNull(); });
    expect(panel.shadowRoot?.querySelector(".inline-comment")).toBeNull();
    button(panel, "Edit comment").click();
    await vi.waitFor(() => { expect(button(panel, "Save comment").disabled).toBe(false); });
    expect(peer).toHaveBeenLastCalledWith("diff", { source: "git-compare", path: "compared.ts", comparison: original, context: 3 }, expect.anything());
    expect(required(panel.shadowRoot?.querySelector<HTMLInputElement>('input[name="base"]')).value).toBe("main");
    expect(panel.shadowRoot?.querySelector(".inline-comment")?.textContent).toContain("Across several commits");
  });
  it.each(["source switch", "new comparison", "disposal"])("ignores an obsolete revision resolution after %s", async (cause) => {
    const pending = deferred<GitComparison>();
    const resolved: GitComparison = { baseRef: "main", headRef: "HEAD", mode: "merge-base", base: "a".repeat(40), head: "b".repeat(40) };
    const peer = vi.fn().mockImplementation((operation: string) => operation === "compare" ? pending.promise : Promise.resolve(["obsolete.ts"]));
    const ctx = context(); ctx.peer = { request: peer };
    const { panel, host } = await mount(ctx);
    chooseSource(panel, "git-compare"); await panel.updateComplete;
    if (cause === "source switch") chooseSource(panel, "files");
    if (cause === "disposal") host.remove();
    if (cause === "new comparison") {
      peer.mockImplementation((operation: string) => Promise.resolve(operation === "compare" ? { ...resolved, head: "c".repeat(40) } : ["current.ts"]));
      submitComparison(panel);
    }
    pending.resolve(resolved); await pending.promise; await panel.updateComplete;
    await vi.waitFor(() => { expect(panel.shadowRoot?.textContent).not.toContain("obsolete.ts"); });
    if (cause === "new comparison") await vi.waitFor(() => { expect(button(panel, "current.ts")).toBeDefined(); });
  });
  it("ignores an old diff after changing comparisons and displays resolution errors", async () => {
    const pending = deferred<string>();
    const comparison: GitComparison = { baseRef: "main", headRef: "HEAD", mode: "merge-base", base: "a".repeat(40), head: "b".repeat(40) };
    const peer = vi.fn().mockImplementation((operation: string, input: unknown) => {
      if (operation === "compare") return Promise.resolve({ ...comparison });
      if (operation === "changes") return Promise.resolve(["compared.ts"]);
      if (!record(input) || input["source"] !== "git-compare") throw new Error("Missing comparison");
      return pending.promise;
    });
    const ctx = context(); ctx.peer = { request: peer };
    const { panel } = await mount(ctx); chooseSource(panel, "git-compare");
    await vi.waitFor(() => { expect(button(panel, "compared.ts")).toBeDefined(); });
    button(panel, "compared.ts").click();
    peer.mockRejectedValueOnce(new Error("Unknown revision missing-branch"));
    submitComparison(panel);
    pending.resolve("@@ -1 +1 @@\n-before\n+obsolete diff\n"); await pending.promise;
    await vi.waitFor(() => { expect(panel.shadowRoot?.querySelector('[role="alert"]')?.textContent).toContain("Unknown revision"); });
    expect(panel.shadowRoot?.querySelector('[aria-label="Review source"]')).toBeNull();
    expect(panel.shadowRoot?.textContent).not.toContain("obsolete diff");
  });
  it("selects a range, saves Markdown, edits coordinates, remounts and removes feedback", async () => {
    const { panel, ctx, host, contribution } = await mount(); await open(panel);
    required(panel.shadowRoot?.querySelector<HTMLButtonElement>('[aria-label="Current line 1"]')).click(); await panel.updateComplete;
    required(panel.shadowRoot?.querySelector<HTMLButtonElement>('[aria-label="Current line 3"]')).dispatchEvent(new MouseEvent("click", { shiftKey: true })); await panel.updateComplete;
    await editBody(panel, "**Fix** this"); button(panel, "Save comment").click(); await panel.updateComplete;
    await vi.waitFor(() => { expect(panel.shadowRoot?.querySelector('.editor button[disabled]')).toBeNull(); });
    const store = required(panel.store);
    expect((await store.load(workspaceKey(ctx)))[0]).toMatchObject({ start: 1, end: 3, body: "**Fix** this", source: "files" });
    expect(panel.shadowRoot?.querySelector("article strong")?.textContent).toContain("a.ts:1-3");
    expect(panel.shadowRoot?.querySelector("article .markdown strong")?.textContent).toBe("Fix");
    button(panel, "Edit comment").click();
    await vi.waitFor(() => { expect(button(panel, "Save comment").disabled).toBe(false); });
    const end = required([...panel.shadowRoot?.querySelectorAll<HTMLInputElement>('.editor input') ?? []].find((input) => input.parentElement?.textContent.includes("End line") === true));
    end.value = "0"; end.dispatchEvent(new Event("input")); await panel.updateComplete;
    expect(button(panel, "Save comment").disabled).toBe(true);
    button(panel, "Cancel edit").click(); await panel.updateComplete;
    render(null, host); render(contribution.render(ctx), host); await panel.updateComplete;
    expect(panel.shadowRoot?.textContent).toContain("Saved comments (1)");
    button(panel, "Remove comment").click(); await panel.updateComplete;
    await vi.waitFor(() => { expect(panel.shadowRoot?.textContent).toContain("Saved comments (0)"); });
    expect(await store.load(workspaceKey(ctx))).toEqual([]);
  });
  it("keeps drafts on a storage failure, and retains stale saved comments without attaching them to new lines", async () => {
    const { panel, ctx } = await mount(); await open(panel);
    required(panel.shadowRoot?.querySelector<HTMLButtonElement>('[aria-label="Current line 1"]')).click(); await panel.updateComplete;
    await editBody(panel, "keep my work");
    const store = panel.store;
    panel.store = new ReviewStore({ transact: () => Promise.reject(new Error("storage blocked")) }, localStorage);
    button(panel, "Save comment").click(); await panel.updateComplete;
    await vi.waitFor(() => { expect(panel.shadowRoot?.querySelector('.editor button[disabled]')).toBeNull(); });
    expect(panel.shadowRoot?.querySelector('[role="alert"]')?.textContent).toContain("storage blocked");
    expect(panel.shadowRoot?.querySelector<HTMLTextAreaElement>('.editor textarea')?.value).toBe("keep my work");
    panel.store = store; button(panel, "Save comment").click(); await panel.updateComplete;
    await vi.waitFor(() => { expect(panel.shadowRoot?.querySelector('.editor button[disabled]')).toBeNull(); });
    ctx.files.readFile = vi.fn().mockResolvedValue({ content: "changed\n", binary: false, truncated: false });
    button(panel, "Refresh").click();
    await vi.waitFor(() => { expect(panel.shadowRoot?.querySelector(".stale")?.textContent).toContain("Source changed"); });
    expect(panel.shadowRoot?.querySelector(".inline-comment")).toBeNull();
    expect(await required(panel.store).load(workspaceKey(ctx))).toHaveLength(1);
  });
  it("discards obsolete file results after a source switch and cleans up on disconnect", async () => {
    const ctx = context(); let finish: ((value: FileContentResponse) => void) | undefined;
    ctx.files.readFile = vi.fn(() => new Promise<FileContentResponse>((resolve) => { finish = resolve; }));
    const { panel, host } = await mount(ctx); button(panel, "a.ts").click();
    chooseSource(panel, "git-staged");
    required(finish)({ path: "a.ts", content: "obsolete", encoding: "utf8", size: 8, modifiedAt: "now", binary: false, truncated: false });
    await vi.waitFor(() => { expect(panel.shadowRoot?.querySelector('[role="status"]')?.textContent).not.toContain("Loading"); });
    expect(panel.shadowRoot?.textContent).not.toContain("obsolete");
    host.remove();
    expect(panel.isConnected).toBe(false);
  });
  it("stages feedback on LAN HTTP without prompt insertion or clipboard access", async () => {
    const nativeCrypto = crypto;
    vi.stubGlobal("crypto", { getRandomValues: nativeCrypto.getRandomValues.bind(nativeCrypto) });
    vi.stubGlobal("navigator", {});
    const ctx = context(); const setChip = vi.fn<(chip: PluginPromptChip) => void>(); ctx.prompt.setChip = setChip;
    const { panel, host, contribution } = await mount(ctx); await open(panel);
    required(panel.shadowRoot?.querySelector<HTMLButtonElement>('[aria-label="Current line 1"]')).click(); await panel.updateComplete;
    await editBody(panel, "HTTP comment"); button(panel, "Save comment").click(); await panel.updateComplete;
    await vi.waitFor(() => { expect(panel.shadowRoot?.querySelector('.editor button[disabled]')).toBeNull(); });
    expect((await required(panel.store).load(workspaceKey(ctx)))[0]?.body).toBe("HTTP comment");
    button(panel, "Attach review to composer").click(); await panel.updateComplete;
    await vi.waitFor(() => { expect(setChip).toHaveBeenCalledOnce(); });
    const chip = required(setChip.mock.calls[0]?.[0]);
    expect(chip.text).toContain("HTTP comment");
    render(null, host); // Submission callbacks outlive the Review tab's DOM.
    await chip.onRemove?.("submitted");
    expect(await required(panel.store).load(workspaceKey(ctx))).toEqual([]);
    render(contribution.render(ctx), host); await panel.updateComplete;
    await vi.waitFor(() => { expect(panel.shadowRoot?.textContent).toContain("Saved comments (0)"); });
  });
  it.each(["success", "read failure"])("keeps pending attach ownership across a fresh same-scope context: %s", async (outcome) => {
    const { panel, ctx, host, contribution } = await mount();
    const store = required(panel.store); await store.add(workspaceKey(ctx), savedComment); panel.refreshFeedback();
    await vi.waitFor(() => { expect(button(panel, "Attach review to composer").disabled).toBe(false); });
    const pending = deferred<Comment[]>();
    const read = vi.spyOn(store, "load").mockReturnValueOnce(pending.promise);
    button(panel, "Attach review to composer").click();
    expect(read).toHaveBeenCalledOnce();
    const fresh = context(); render(contribution.render(fresh), host); await panel.updateComplete;
    expect(host.firstElementChild).toBe(panel);
    if (outcome === "success") {
      pending.resolve([savedComment]);
      await vi.waitFor(() => { expect(vi.spyOn(ctx.prompt, "setChip")).toHaveBeenCalledOnce(); });
    } else {
      pending.reject(new Error("attach read unavailable"));
      await vi.waitFor(() => { expect(panel.shadowRoot?.querySelector('[role="alert"]')?.textContent).toContain("attach read unavailable"); });
      expect(vi.spyOn(ctx.prompt, "setChip")).not.toHaveBeenCalled();
    }
    expect(vi.spyOn(fresh.prompt, "setChip")).not.toHaveBeenCalled(); // Never redirect to the new facade.
  });
  it.each(["session", "pending", "archived", "workspace", "machine", "project", "away and back"])("cancels pending attachment on a real selection change: %s", async (change) => {
    const { panel, ctx, host, contribution } = await mount();
    const store = required(panel.store); await store.add(workspaceKey(ctx), savedComment); panel.refreshFeedback();
    await vi.waitFor(() => { expect(button(panel, "Attach review to composer").disabled).toBe(false); });
    const pending = deferred<Comment[]>(); const read = vi.spyOn(store, "load").mockReturnValueOnce(pending.promise);
    button(panel, "Attach review to composer").click(); expect(read).toHaveBeenCalledOnce();
    const next = context(); const session = required(next.state?.selectedSession);
    if (change === "session" || change === "away and back") next.state = { ...next.state, selectedSession: { ...session, id: "other" } };
    if (change === "pending") next.state = { ...next.state, selectedSession: { ...session, pending: true } };
    if (change === "archived") next.state = { ...next.state, selectedSession: { ...session, archived: true } };
    if (change === "workspace") next.workspace = { ...next.workspace, id: "other" };
    if (change === "machine") next.machine = { ...next.machine, id: "other" };
    if (change === "project") next.workspace = { ...next.workspace, projectId: "other" };
    render(contribution.render(next), host);
    if (change === "away and back") render(contribution.render(ctx), host);
    pending.resolve([savedComment]); await pending.promise; await panel.updateComplete; await panel.updateComplete;
    expect(vi.spyOn(ctx.prompt, "setChip")).not.toHaveBeenCalled(); expect(vi.spyOn(next.prompt, "setChip")).not.toHaveBeenCalled();
  });
  it.each(["save", "delete"])("routes a detached %s rejection to A after returning from B", async (operation) => {
    const { panel, ctx, host, contribution } = await mount();
    const store = required(panel.store);
    if (operation === "save") {
      await open(panel);
      required(panel.shadowRoot?.querySelector<HTMLButtonElement>('[aria-label="Current line 1"]')).click(); await panel.updateComplete;
      await editBody(panel, "pending save");
    } else {
      await store.add(workspaceKey(ctx), savedComment); panel.refreshFeedback();
      await vi.waitFor(() => { expect(button(panel, "Remove comment")).toBeDefined(); });
    }
    const pending = deferred<Comment[]>();
    const mutation = vi.spyOn(store, operation === "save" ? "add" : "remove").mockReturnValueOnce(pending.promise);
    button(panel, operation === "save" ? "Save comment" : "Remove comment").click(); expect(mutation).toHaveBeenCalledOnce();
    const other = context(); other.workspace = { ...other.workspace, id: "other" };
    render(contribution.render(other), host);
    const otherPanel = reviewPanel(host); await otherPanel.updateComplete;
    render(contribution.render(ctx), host);
    const remounted = reviewPanel(host); await remounted.updateComplete;
    expect(remounted).not.toBe(panel); expect(panel.isConnected).toBe(false);
    pending.reject(new Error(`${operation} failed after return`));
    await vi.waitFor(() => { expect(remounted.shadowRoot?.querySelector('[role="alert"]')?.textContent).toContain(`${operation} failed after return`); });
    expect(otherPanel.shadowRoot?.textContent).not.toContain(`${operation} failed after return`);
    button(remounted, "Dismiss feedback warning").click(); await remounted.updateComplete;
    render(contribution.render(other), host); render(contribution.render(ctx), host);
    const again = reviewPanel(host); await again.updateComplete;
    expect(again.shadowRoot?.textContent).not.toContain(`${operation} failed after return`);
  });
  it("keeps first-mount storage failures visible across source refresh and workspace remount", async () => {
    const ctx = context();
    localStorage.setItem(storagePrefix + workspaceKey(ctx), "broken migration");
    const { panel, host, contribution } = await mount(ctx);
    await vi.waitFor(() => { expect(button(panel, "Dismiss feedback warning")).toBeDefined(); });
    const warning = panel.shadowRoot?.querySelector('[role="alert"]')?.textContent;
    await open(panel); button(panel, "Refresh").click(); await panel.updateComplete;
    expect(panel.shadowRoot?.textContent).toContain(warning);
    const other = context(); other.workspace = { ...other.workspace, id: "other" };
    render(contribution.render(other), host);
    render(contribution.render(ctx), host);
    const remounted = reviewPanel(host); await remounted.updateComplete;
    expect(remounted.shadowRoot?.textContent).toContain(warning);
  });
  it("keeps acknowledgement failure visible after navigation, remount and successful source loads", async () => {
    const ctx = context(); const staged = vi.fn<(chip: PluginPromptChip) => void>(); ctx.prompt.setChip = staged;
    const { panel, host, contribution } = await mount(ctx);
    const store = required(panel.store); await store.add(workspaceKey(ctx), savedComment); panel.refreshFeedback();
    await vi.waitFor(() => { expect(button(panel, "Attach review to composer").disabled).toBe(false); });
    button(panel, "Attach review to composer").click();
    await vi.waitFor(() => { expect(staged).toHaveBeenCalledOnce(); });
    const failure = vi.spyOn(store, "removeUnchanged").mockRejectedValueOnce(new Error("quota"));
    const log = vi.spyOn(console, "error").mockImplementation(() => { /* Suppress expected failure logging. */ });
    const other = context(); other.workspace = { ...other.workspace, id: "other" };
    render(contribution.render(other), host);
    await expect(required(staged.mock.calls[0]?.[0]).onRemove?.("submitted")).rejects.toThrow("quota");
    render(contribution.render(ctx), host);
    const remounted = reviewPanel(host); await remounted.updateComplete;
    await open(remounted); button(remounted, "Refresh").click(); await remounted.updateComplete;
    expect(remounted.shadowRoot?.textContent).toContain("saved feedback could not be cleared");
    expect(await store.load(workspaceKey(ctx))).toEqual([savedComment]);
    failure.mockRestore(); log.mockRestore();
  });
  it.each(["Remove comment", "Attach review to composer"])("retains the accepted-review warning after failed %s and feedback reads until explicit dismissal", async (action) => {
    const ctx = context(); const staged = vi.fn<(chip: PluginPromptChip) => void>(); ctx.prompt.setChip = staged;
    const { panel, host, contribution } = await mount(ctx);
    const store = required(panel.store); await store.add(workspaceKey(ctx), savedComment); panel.refreshFeedback();
    await vi.waitFor(() => { expect(button(panel, "Attach review to composer").disabled).toBe(false); });
    button(panel, "Attach review to composer").click();
    await vi.waitFor(() => { expect(staged).toHaveBeenCalledOnce(); });
    vi.spyOn(console, "error").mockImplementation(() => { /* Suppress expected failure logging. */ });
    vi.spyOn(store, "removeUnchanged").mockRejectedValue(new Error("storage inaccessible"));
    const reads = vi.spyOn(store, "load").mockRejectedValue(new Error("feedback reads inaccessible"));
    const warning = "The review was accepted, but saved feedback could not be cleared. Check the conversation before attaching it again.";
    await expect(required(staged.mock.calls[0]?.[0]).onRemove?.("submitted")).rejects.toThrow("storage inaccessible");
    await vi.waitFor(() => { expect(panel.shadowRoot?.textContent).toContain("feedback reads inaccessible"); });
    expect(panel.shadowRoot?.textContent).toContain(warning);
    const actionError = `${action} failed: storage inaccessible`;
    if (action === "Remove comment") vi.spyOn(store, "remove").mockRejectedValue(new Error(actionError));
    else reads.mockRejectedValueOnce(new Error(actionError));
    button(panel, action).click();
    await vi.waitFor(() => { expect(panel.shadowRoot?.textContent).toContain(actionError); });
    expect(panel.shadowRoot?.textContent).toContain(warning);
    expect(staged).toHaveBeenCalledOnce();
    const other = context(); other.workspace = { ...other.workspace, id: "other" };
    render(contribution.render(other), host); render(contribution.render(ctx), host);
    const remounted = reviewPanel(host); await remounted.updateComplete;
    await open(remounted); button(remounted, "Refresh").click(); await remounted.updateComplete;
    await vi.waitFor(() => { expect(remounted.shadowRoot?.textContent).toContain("feedback reads inaccessible"); });
    expect(remounted.shadowRoot?.textContent).toContain(warning);
    expect(remounted.shadowRoot?.textContent).toContain(actionError);
    // Recovery must not implicitly dismiss acceptance, action, or read warnings.
    reads.mockRestore(); remounted.refreshFeedback();
    await vi.waitFor(() => { expect(remounted.shadowRoot?.textContent).toContain("Saved comments (1)"); });
    expect(remounted.shadowRoot?.textContent).toContain(warning);
    expect(remounted.shadowRoot?.textContent).toContain(actionError);
    button(remounted, "Dismiss feedback warning").click(); await remounted.updateComplete;
    expect(remounted.shadowRoot?.textContent).not.toContain(warning);
    expect(remounted.shadowRoot?.textContent).not.toContain(actionError);
    render(contribution.render(other), host); render(contribution.render(ctx), host);
    const again = reviewPanel(host); await again.updateComplete;
    expect(again.shadowRoot?.textContent).not.toContain(warning);
    expect(again.shadowRoot?.textContent).not.toContain(actionError);
    expect(again.shadowRoot?.textContent).not.toContain("feedback reads inaccessible");
  });
  it("ignores an older feedback read after a newer read and disconnect", async () => {
    const { panel, host } = await mount();
    const store = required(panel.store);
    const older = deferred<Comment[]>(); const newer = deferred<Comment[]>();
    const reads = vi.spyOn(store, "load").mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    panel.refreshFeedback(); panel.refreshFeedback();
    newer.resolve([savedComment]); await newer.promise; await panel.updateComplete;
    older.resolve([]); await older.promise; await panel.updateComplete;
    expect(panel.shadowRoot?.textContent).toContain("Saved comments (1)");
    const detached = deferred<Comment[]>(); reads.mockReturnValueOnce(detached.promise);
    panel.refreshFeedback(); host.remove(); detached.resolve([]); await detached.promise; await panel.updateComplete;
    expect(panel.shadowRoot?.textContent).toContain("Saved comments (1)");
  });
  it("requests a badge rerender even before the Review panel is mounted", async () => {
    const lifetime = new AbortController(); const ctx = context();
    const activation = await plugin.activate({ apiVersion: 5, pluginId: "review", runtimePluginId: "review", html, svg, signal: new AbortController().signal, lifetimeSignal: lifetime.signal });
    cleanups.push(() => { lifetime.abort(); void activation.dispose?.(new AbortController().signal); });
    const contribution = required(activation.contributions.workspacePanels?.[0]);
    contribution.badge?.(ctx);
    await vi.waitFor(() => { expect(vi.spyOn(ctx.host, "requestRender")).toHaveBeenCalled(); });
    expect(contribution.badge?.(ctx)).toBeUndefined();
  });
  it("refreshes remote badges and withdraws chips without self-cancelling local attachments", async () => {
    const first = await mount(); const second = await mount();
    const key = workspaceKey(first.ctx);
    first.contribution.badge?.(first.ctx); second.contribution.badge?.(second.ctx);
    await required(first.panel.store).add(key, savedComment); first.panel.refreshFeedback();
    await vi.waitFor(() => { expect(second.panel.shadowRoot?.textContent).toContain("Saved comments (1)"); });
    await vi.waitFor(() => { expect(first.contribution.badge?.(first.ctx)).toBe(1); });
    button(first.panel, "Attach review to composer").click();
    await vi.waitFor(() => { expect(vi.spyOn(first.ctx.prompt, "setChip")).toHaveBeenCalledOnce(); });
    expect(vi.spyOn(first.ctx.prompt, "removeChip")).not.toHaveBeenCalled();
    await required(second.panel.store).update(key, { ...savedComment, body: "remote edit" });
    await vi.waitFor(() => { expect(vi.spyOn(first.ctx.prompt, "removeChip")).toHaveBeenCalledOnce(); });
    await vi.waitFor(() => { expect(first.panel.shadowRoot?.textContent).toContain("remote edit"); });
  });
  it("never renders executable Markdown or remote images", () => {
    const host = document.createElement("div");
    render(renderReviewMarkdown(html, '**safe** <script>alert(1)</script> <img src="https://tracker/" onerror="alert(1)"> [bad](javascript:alert(1))'), host);
    expect(host.querySelector("strong")?.textContent).toBe("safe");
    expect(host.querySelector("script,img,[onerror],[href^='javascript:']")).toBeNull();
  });
});
