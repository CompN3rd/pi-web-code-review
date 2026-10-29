import { LitElement, html, type PropertyValues } from "lit";
import { reviewStyles } from "./styles.js";
import { readPreferences, writePreferences, type ReviewLayout, type ReviewPreferences } from "./preferences.js";
import { renderReviewMarkdown } from "./markdown.js";
import type { FileTreeEntry, WorkspacePanelContext } from "@jmfederico/pi-web/plugin-api";
import { isGitSource, isWorkspacePath, MAX_FILES, MAX_TEXT_LENGTH, parseComparison, parseDiff, parsePaths, type GitComparison, type ReviewSource } from "../protocol.js";
import { anchorInSnapshot, anchorLabel, randomId, ReviewStore, reviewMarkdown, snapshot, sourceLabel, workspaceKey, type Anchor, type Comment, type Row, type Snapshot } from "./model.js";
import type { ReviewChips } from "./chips.js";

interface Editor extends Anchor { body: string; hash: string; id?: string; createdAt?: number }
export type FeedbackErrorKind = "acceptance" | "action" | "read";

function selectionKey(context: WorkspacePanelContext): string {
  const session = context.state?.selectedSession;
  return JSON.stringify([workspaceKey(context), context.workspace.path, context.state?.selectedMachine?.id,
    session?.id, session?.cwd, session?.pending, session?.archived]);
}

export class ReviewPanel extends LitElement {
  static override properties = { context: { attribute: false }, revision: { type: Number } };
  declare context: WorkspacePanelContext;
  declare revision: number;
  chips: ReviewChips | undefined;
  store: ReviewStore | undefined;
  lifetime: AbortSignal | undefined;
  private preferences = readPreferences();
  private settingsLayout: ReviewLayout = this.preferences.layout;
  private dialogKind: "settings" | "files" | "notes" | undefined;
  private preferenceError = "";
  private source: ReviewSource = "files";
  private diffContext: number | "all" = 3;
  private scrollPositions = new Map<Element, { top: number; left: number }>();
  private restoringScroll = false;
  private rememberScroll = (event: Event): void => {
    const target = event.target === this.ownerDocument ? this.ownerDocument.scrollingElement : event.target;
    if (this.isConnected && !this.restoringScroll && target instanceof Element && (this.renderRoot.contains(target) || target.contains(this))) {
      this.scrollPositions.set(target, { top: target.scrollTop, left: target.scrollLeft });
    }
  };
  private baseRef = "main";
  private headRef = "HEAD";
  private comparisonMode: GitComparison["mode"] = "merge-base";
  private comparison: GitComparison | undefined;
  private comparing: AbortController | undefined;
  private directory = "";
  private entries: FileTreeEntry[] = [];
  private view: Snapshot | undefined;
  private editor: Editor | undefined;
  private comments: Comment[] = [];
  private error = "";
  // Accepted-but-not-cleared feedback must survive later action and read failures.
  private feedbackErrors: Record<FeedbackErrorKind, string> = { acceptance: "", action: "", read: "" };
  onFeedbackError: ((message: string, kind: FeedbackErrorKind) => void) | undefined;
  private selection = "";
  private selectionRevision = 0;
  private feedbackRead = 0;
  private connection = 0;
  private saving = false;
  private focusEditor = false;
  private notice = "";
  private listLoading = false;
  private viewLoading = false;
  private listing: AbortController | undefined;
  private reading: AbortController | undefined;

  override connectedCallback(): void {
    super.connectedCallback();
    this.connection++;
    void this.loadComments();
    this.renderRoot.addEventListener("scroll", this.rememberScroll, true);
    this.ownerDocument.addEventListener("scroll", this.rememberScroll, true);
    // Reattaching the same panel is navigation, not a request to reset a comparison.
    if (this.view === undefined) void this.refresh();
    else void this.loadList();
    const positions = new Map(this.scrollPositions);
    const connection = this.connection;
    this.restoringScroll = true;
    void this.updateComplete.then(() => {
      const restore = () => {
        if (!this.isConnected || this.connection !== connection) return;
        for (const [element, position] of positions) {
          element.scrollTop = position.top; element.scrollLeft = position.left;
        }
      };
      restore();
      // Host layout and document scroll ranges settle after the panel is inserted.
      const window = this.ownerDocument.defaultView;
      if (window === null) { this.restoringScroll = false; return; }
      window.requestAnimationFrame(() => {
        restore();
        window.requestAnimationFrame(() => { if (this.connection === connection) this.restoringScroll = false; });
      });
    });
  }
  override disconnectedCallback(): void {
    this.connection++; this.feedbackRead++;
    this.renderRoot.removeEventListener("scroll", this.rememberScroll, true);
    this.ownerDocument.removeEventListener("scroll", this.rememberScroll, true);
    this.closeDialog();
    this.listing?.abort(); this.reading?.abort(); this.comparing?.abort();
    super.disconnectedCallback();
  }
  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has("revision") && changed.get("revision") !== undefined) void this.refresh();
    if (this.focusEditor) {
      const textarea = this.renderRoot.querySelector<HTMLTextAreaElement>(".editor textarea");
      if (textarea !== null) {
        this.focusEditor = false;
        textarea.focus({ preventScroll: true });
        textarea.closest(".editor")?.scrollIntoView({ block: "nearest" });
      }
    }
  }
  updateContext(context: WorkspacePanelContext): void {
    const selection = selectionKey(context);
    if (selection !== this.selection) { this.selection = selection; this.selectionRevision++; }
    this.context = context;
  }
  refreshFeedback(message?: string): void {
    void this.loadComments();
    if (message !== undefined) this.notice = message;
    this.requestUpdate();
  }
  private requireChips(): ReviewChips {
    if (this.chips === undefined) throw new Error("Composer integration is unavailable");
    return this.chips;
  }
  private fail(error: unknown): void { this.error = error instanceof Error ? error.message : String(error); this.requestUpdate(); }
  // Activation-owned updates only display state; reporting is a separate path to avoid recursion.
  setFeedbackError(message: string, kind: FeedbackErrorKind = "action"): void {
    this.feedbackErrors[kind] = message; this.requestUpdate();
  }
  private reportFeedbackError(message: string, kind: FeedbackErrorKind): void {
    this.setFeedbackError(message, kind); this.onFeedbackError?.(message, kind);
  }
  private feedbackFailed(error: unknown, kind: FeedbackErrorKind = "action"): void {
    this.reportFeedbackError(error instanceof Error ? error.message : String(error), kind);
  }
  private async loadComments(): Promise<void> {
    const read = ++this.feedbackRead;
    const key = workspaceKey(this.context);
    try {
      const comments = await this.requireStore().load(key);
      if (read !== this.feedbackRead || !this.isConnected || this.lifetime?.aborted === true || key !== workspaceKey(this.context)) return;
      this.comments = comments; this.requestUpdate();
    } catch (error) {
      if (read === this.feedbackRead && this.lifetime?.aborted !== true) this.feedbackFailed(error, "read");
    }
  }
  private requireStore(): ReviewStore {
    if (this.store === undefined) throw new Error("Review storage is unavailable");
    return this.store;
  }
  private signal(controller: AbortController): AbortSignal {
    return this.lifetime === undefined ? controller.signal : AbortSignal.any([controller.signal, this.lifetime]);
  }
  private async applyComparison(): Promise<void> {
    const path = this.view?.path;
    this.comparing?.abort(); this.listing?.abort(); this.reading?.abort();
    const controller = new AbortController(); this.comparing = controller;
    const signal = this.signal(controller);
    this.comparison = undefined; this.view = undefined; this.entries = [];
    this.listLoading = false; this.viewLoading = false; this.error = ""; this.requestUpdate();
    try {
      const peer = this.context.peer;
      if (peer?.request === undefined) throw new Error("Git review backend unavailable");
      const comparison = parseComparison(await peer.request("compare", {
        source: "git-compare", baseRef: this.baseRef.trim(), headRef: this.headRef.trim(), mode: this.comparisonMode,
      }, { signal }));
      if (signal.aborted) return;
      this.comparison = comparison;
      await this.loadList();
      signal.throwIfAborted();
      if (path !== undefined) await this.openFile(path);
    } catch (error) { if (!signal.aborted) this.fail(error); }
    finally { if (this.comparing === controller) { this.comparing = undefined; this.requestUpdate(); } }
  }
  private async refresh(): Promise<void> {
    if (this.source === "git-compare") { await this.applyComparison(); return; }
    const path = this.view?.path;
    await Promise.all([this.loadList(), path === undefined ? Promise.resolve() : this.openFile(path)]);
  }
  private async loadList(): Promise<void> {
    this.listing?.abort();
    if (this.source === "git-compare" && this.comparison === undefined) return;
    const controller = new AbortController(); this.listing = controller;
    const signal = this.signal(controller);
    this.listLoading = true; this.error = ""; this.requestUpdate();
    try {
      let entries: FileTreeEntry[];
      if (this.source === "files") {
        const result = this.context.files.capabilityVersion === 1
          ? await this.context.files.listFiles(this.directory, { signal }) : await this.context.files.listFiles(this.directory);
        if (result.truncated || result.entries.length > MAX_FILES) throw new Error("Directory is too large; enter a narrower directory");
        entries = result.entries.filter((entry) => isWorkspacePath(entry.path));
      } else {
        const peer = this.context.peer;
        if (peer?.request === undefined) throw new Error("Git review backend is unavailable. Enable the plugin on this machine and restart its session daemon");
        const paths = parsePaths(await peer.request("changes", { source: this.source, ...(this.comparison === undefined ? {} : { comparison: { ...this.comparison } }) }, { signal }));
        entries = paths.map((path) => ({ path, name: path, type: "file" }));
      }
      if (signal.aborted) return;
      this.entries = entries;
    } catch (error) { if (!signal.aborted) this.fail(error); }
    finally { if (this.listing === controller) { this.listLoading = false; this.requestUpdate(); } }
  }
  private async openFile(path: string): Promise<void> {
    this.reading?.abort();
    const controller = new AbortController(); this.reading = controller;
    const signal = this.signal(controller);
    const source = this.source; const comparison = this.comparison;
    this.viewLoading = true; this.error = ""; this.requestUpdate();
    try {
      if (!isWorkspacePath(path)) throw new Error("Enter a workspace-relative file path");
      let text: string;
      let canonical: string | undefined;
      if (source === "files") {
        const result = this.context.files.capabilityVersion === 1
          ? await this.context.files.readFile(path, { signal }) : await this.context.files.readFile(path);
        if (result.binary || result.truncated || result.content.length > MAX_TEXT_LENGTH) throw new Error("Binary, truncated, or oversized files cannot be reviewed inline");
        text = result.content;
      } else {
        const peer = this.context.peer;
        if (peer?.request === undefined) throw new Error("Git review backend unavailable");
        const input = { source, path, ...(comparison === undefined ? {} : { comparison: { ...comparison } }) };
        text = parseDiff(await peer.request("diff", { ...input, context: this.diffContext }, { signal }));
        // Keep existing saved-comment fingerprints independent of display context.
        if (this.diffContext !== 3) canonical = parseDiff(await peer.request("diff", { ...input, context: 3 }, { signal }));
      }
      const next = snapshot(path, source, text, comparison);
      if (canonical !== undefined) next.hash = snapshot(path, source, canonical, comparison).hash;
      if (signal.aborted) return;
      if (this.view?.path !== path) {
        this.scrollPositions.clear();
        const code = this.renderRoot.querySelector(".code");
        if (code !== null) { code.scrollTop = 0; code.scrollLeft = 0; }
      }
      this.view = next;
      if (this.editor !== undefined) this.focusEditor = true;
      // Never attach an unfinished comment to refreshed or unrelated content.
      if (this.editor !== undefined && (this.editor.path !== path || this.editor.source !== source || this.editor.hash !== next.hash)) {
        this.notice = "The source changed. Your unfinished comment remains in the draft editor, but cannot be saved against this snapshot. Copy its text before cancelling.";
      }
    } catch (error) { if (!signal.aborted) { this.view = undefined; this.fail(error); } }
    finally { if (this.reading === controller) { this.viewLoading = false; this.requestUpdate(); } }
  }
  private async changeDiffContext(value: string): Promise<void> {
    const previous = this.view;
    const code = this.renderRoot.querySelector<HTMLElement>(".code");
    const top = code?.getBoundingClientRect().top ?? 0;
    const line = [...this.renderRoot.querySelectorAll<HTMLButtonElement>(".code button.line")]
      .find((button) => button.getBoundingClientRect().bottom > Math.max(0, top));
    const label = line?.getAttribute("aria-label");
    const offset = line?.getBoundingClientRect().top ?? top;
    this.diffContext = value === "all" ? "all" : Number(value);
    if (this.view !== undefined) await this.openFile(this.view.path);
    this.requestUpdate(); await this.updateComplete;
    if (!this.isConnected || label == null || code === null || !code.isConnected
      || this.view?.path !== previous?.path || this.view?.source !== previous?.source) return;
    const next = [...code.querySelectorAll<HTMLButtonElement>("button.line")].find((button) => button.getAttribute("aria-label") === label);
    if (next !== undefined) {
      const delta = next.getBoundingClientRect().top - offset;
      if (code.scrollHeight > code.clientHeight) code.scrollTop += delta;
      else if (offset >= 0) this.ownerDocument.defaultView?.scrollBy(0, delta);
    }
  }
  private selectSource(value: string): void {
    if (value !== "files" && !isGitSource(value)) return;
    this.comparing?.abort(); this.comparing = undefined;
    this.listing?.abort(); this.listLoading = false;
    this.source = value; this.comparison = undefined; this.view = undefined; this.entries = [];
    this.reading?.abort(); this.reading = undefined; this.viewLoading = false;
    if (value === "git-compare") void this.applyComparison(); else void this.loadList();
  }
  private selectLine(row: Row, extend: boolean): void {
    const view = this.view;
    if (this.saving || view === undefined || this.viewLoading || row.line === undefined || row.side === undefined) return;
    if (extend && this.editor !== undefined && this.editor.id === undefined && this.editor.path === view.path && this.editor.source === view.source && this.editor.side === row.side && this.editor.hash === view.hash) {
      this.editor = { ...this.editor, start: Math.min(this.editor.start, row.line), end: Math.max(this.editor.start, row.line) };
    } else if (this.editor === undefined) {
      this.editor = { path: view.path, source: view.source, side: row.side, start: row.line, end: row.line, hash: view.hash, body: "", ...(view.comparison === undefined ? {} : { comparison: view.comparison }) };
    } else {
      this.notice = "Save or cancel the current comment first. Shift-click extends a range on the same side.";
    }
    this.focusEditor = true;
    this.requestUpdate();
  }
  private async saveEditor(): Promise<void> {
    const editor = this.editor;
    if (this.saving || editor === undefined || editor.body.trim() === "" || this.viewLoading || editor.hash !== this.view?.hash || !anchorInSnapshot(editor, this.view)) return;
    const context = this.context; const key = workspaceKey(context); const connection = this.connection;
    this.saving = true; this.feedbackRead++; this.requestUpdate();
    try {
      const comment: Comment = { ...editor, id: editor.id ?? randomId(), createdAt: editor.createdAt ?? Date.now() };
      const store = this.requireStore();
      this.requireChips().withdrawWorkspace(key);
      await (editor.id === undefined ? store.add(key, comment) : store.update(key, comment));
      if (this.editor === editor) this.editor = undefined;
      if (connection !== this.connection || !this.isConnected || this.lifetime?.aborted === true) return;
      this.notice = "Comment saved. Attach the updated review when ready.";
      await this.loadComments(); context.host.requestRender();
    } catch (error) { if (this.lifetime?.aborted !== true) this.feedbackFailed(error); }
    finally { this.saving = false; this.requestUpdate(); }
  }
  private async removeComment(comment: Comment): Promise<void> {
    if (this.saving) return;
    const context = this.context; const key = workspaceKey(context); const connection = this.connection;
    this.saving = true; this.feedbackRead++; this.requestUpdate();
    try {
      this.requireChips().withdrawWorkspace(key);
      await this.requireStore().remove(key, comment.id);
      if (this.editor?.id === comment.id) this.editor = undefined;
      if (connection !== this.connection || !this.isConnected || this.lifetime?.aborted === true) return;
      this.notice = "Comment removed. Attach any remaining feedback again before sending.";
      await this.loadComments(); context.host.requestRender();
    } catch (error) { if (this.lifetime?.aborted !== true) this.feedbackFailed(error); }
    finally { this.saving = false; this.requestUpdate(); }
  }
  private editComment(comment: Comment): void {
    if (this.saving) return;
    if (this.editor !== undefined) { this.notice = "Save or cancel the current comment first."; this.requestUpdate(); return; }
    this.editor = { ...comment };
    this.focusEditor = true;
    this.comparing?.abort(); this.comparing = undefined;
    this.source = comment.source; this.comparison = comment.comparison;
    this.view = undefined; this.entries = [];
    if (comment.comparison !== undefined) {
      this.baseRef = comment.comparison.baseRef; this.headRef = comment.comparison.headRef; this.comparisonMode = comment.comparison.mode;
    }
    void this.loadList(); void this.openFile(comment.path);
  }
  private async attachReview(): Promise<void> {
    if (this.saving) return;
    const context = this.context; const connection = this.connection;
    const selection = selectionKey(context); const revision = this.selectionRevision;
    const isCurrent = () => this.isConnected && this.connection === connection
      && this.selectionRevision === revision && selectionKey(this.context) === selection
      && !this.saving && this.lifetime?.aborted !== true;
    try {
      // Keep the captured prompt facade, but allow fresh host contexts for the same selection.
      await this.requireChips().attach(context, isCurrent);
    } catch (error) {
      if (isCurrent()) this.feedbackFailed(error);
    }
  }
  private changeEditor(field: "body" | "start" | "end", event: Event): void {
    if (this.saving || this.editor === undefined || !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) return;
    this.editor = { ...this.editor, [field]: field === "body" ? event.target.value : Number(event.target.value) };
    this.requestUpdate();
  }
  private openDialog(kind: "settings" | "files" | "notes"): void {
    this.dialogKind = kind;
    this.settingsLayout = this.preferences.layout;
    this.requestUpdate();
    void this.updateComplete.then(() => {
      if (!this.isConnected || this.dialogKind !== kind) return;
      const dialog = this.renderRoot.querySelector<HTMLDialogElement>("dialog");
      if (dialog !== null && !dialog.open) dialog.showModal();
    });
  }
  private closeDialog(): void {
    this.renderRoot.querySelector<HTMLDialogElement>("dialog")?.close();
    this.dialogKind = undefined;
    this.requestUpdate();
  }
  private setPreferences(value: ReviewPreferences): void {
    this.preferences = value;
    try { writePreferences(value); this.preferenceError = ""; }
    catch { this.preferenceError = "Review settings could not be saved in this browser. Your choice applies for this panel only."; }
    this.requestUpdate();
  }
  private stepFile(direction: number): void {
    const files = this.entries.filter((entry) => entry.type === "file");
    const index = files.findIndex((entry) => entry.path === this.view?.path);
    const entry = files[index + direction];
    if (entry !== undefined) void this.openFile(entry.path);
  }
  private renderEditor() {
    const editor = this.editor;
    if (editor === undefined) return null;
    const valid = !this.viewLoading && editor.hash === this.view?.hash && anchorInSnapshot(editor, this.view);
    return html`<section class="editor" aria-label="Comment editor">
      <strong>${anchorLabel(editor)} · ${editor.id === undefined ? "Unsaved draft" : "Unsaved edit"}</strong>
      ${valid ? null : html`<p role="alert">Choose a valid range in the current snapshot on one side. Omitted diff lines cannot be selected. Changed snapshots cannot be re-anchored automatically.</p>`}
      <label>Comment (Markdown)<textarea ?disabled=${this.saving} rows="4" .value=${editor.body} @input=${(event: Event) => { this.changeEditor("body", event); }} @keydown=${(event: KeyboardEvent) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.isComposing) { event.preventDefault(); void this.saveEditor(); }
      }}></textarea></label>
      <details class="range"><summary>Line range · ${editor.start}–${editor.end}</summary>
        <div class="toolbar"><label>Start line <input ?disabled=${this.saving} type="number" min="1" step="1" .value=${String(editor.start)} @input=${(event: Event) => { this.changeEditor("start", event); }}></label>
        <label>End line <input ?disabled=${this.saving} type="number" min="1" step="1" .value=${String(editor.end)} @input=${(event: Event) => { this.changeEditor("end", event); }}></label></div>
      </details>
      <div class="toolbar"><button class="ui-button primary" ?disabled=${this.saving || !valid || editor.body.trim() === ""} @click=${() => { void this.saveEditor(); }}>Save comment</button>
      <button class="ui-button" ?disabled=${this.saving} @click=${() => { this.editor = undefined; this.notice = ""; this.requestUpdate(); }}>Cancel edit</button><span class="hint">Ctrl / ⌘ + Enter to save</span></div>
    </section>`;
  }
  private renderFiles() {
    return html`<details class="file-list ui-file-list" open><summary>${this.source === "files" ? this.directory || "Workspace files" : `${sourceLabel(this.source, this.comparison)} files`}</summary>
      ${this.source === "files" && this.directory !== "" ? html`<button class="ui-button" @click=${() => { this.directory = this.directory.split("/").slice(0, -1).join("/"); void this.loadList(); }}>Parent directory</button>` : null}
      ${this.entries.map((entry) => html`<button class="ui-button ui-file-row" title=${entry.path} aria-current=${entry.path === this.view?.path ? "page" : "false"} ?disabled=${this.listLoading} @click=${() => {
        if (entry.type === "directory") { this.directory = entry.path; void this.loadList(); }
        else { this.closeDialog(); void this.openFile(entry.path); }
      }}><span class="file-label ui-file-label">${entry.type === "directory" ? "📁 " : ""}${entry.name}</span></button>`)}
      ${!this.listLoading && this.comparing === undefined && this.entries.length === 0 ? html`<p class="hint">No files in this view.</p>` : null}
    </details>`;
  }
  private renderSaved() {
    return html`<p class="hint">Saved locally · not sent. Only saved comments attach. Send from the conversation.</p>
      ${this.editor === undefined ? null : html`<p class="hint draft-count">1 unsaved draft · ${anchorLabel(this.editor)}</p>`}
      ${this.comments.length === 0 ? html`<p class="hint">No comments yet. Select a line number to add one.</p>` : null}
      ${this.comments.map((comment) => html`<article><strong>${anchorLabel(comment)}</strong>
        ${comment.path === this.view?.path && comment.source === this.view.source && comment.hash !== this.view.hash ? html`<p class="stale">Source changed since this comment was saved. Verify its coordinates before sending.</p>` : null}
        <div class="markdown">${renderReviewMarkdown(html, comment.body)}</div>
        <div class="toolbar"><button class="ui-button" ?disabled=${this.saving} @click=${() => { this.closeDialog(); this.editComment(comment); }}>Edit comment</button><button class="ui-button" ?disabled=${this.saving} @click=${() => { void this.removeComment(comment); }}>Remove comment</button></div>
      </article>`)}
      <details class="markdown-export"><summary>Feedback Markdown</summary><textarea aria-label="Feedback Markdown" readonly rows="8" .value=${reviewMarkdown(this.comments)}></textarea></details>`;
  }
  private renderDialog() {
    return html`<dialog class=${this.dialogKind === "settings" ? "settings" : "sheet"} aria-labelledby="review-dialog-title" @close=${() => { this.dialogKind = undefined; this.requestUpdate(); }}>
      <div class="dialog-heading"><h2 id="review-dialog-title">${this.dialogKind === "settings" ? "Review settings" : this.dialogKind === "files" ? "Review files" : "Review notes"}</h2><button class="ui-button" aria-label="Close dialog" @click=${() => { this.closeDialog(); }}>✕</button></div>
      ${this.dialogKind === "settings" ? html`<form @submit=${(event: SubmitEvent) => { event.preventDefault(); this.setPreferences({ ...this.preferences, layout: this.settingsLayout }); this.closeDialog(); }}>
        <p class="hint">Layout · saved for this browser</p>
        <label class="layout-option"><input type="radio" name="layout" value="workbench" .checked=${this.settingsLayout === "workbench"} @change=${() => { this.settingsLayout = "workbench"; this.requestUpdate(); }}><span><strong>Workbench</strong><span class="hint">Files, code and notes side by side. On phones, files and notes open as sheets.</span></span></label>
        <label class="layout-option"><input type="radio" name="layout" value="focus" .checked=${this.settingsLayout === "focus"} @change=${() => { this.settingsLayout = "focus"; this.requestUpdate(); }}><span><strong>Focus</strong><span class="hint">A wide code view with inline feedback. On phones, review one file at a time.</span></span></label>
        <p class="hint">Switch layouts without losing your current file, line range or draft. This preference applies across workspaces on this browser.</p>
        <button class="ui-button primary settings-save">Apply layout</button>
      </form>` : this.dialogKind === "files" ? this.renderFiles() : this.dialogKind === "notes" ? this.renderSaved() : null}
    </dialog>`;
  }
  override render() {
    const view = this.view;
    const inlineEditor = this.editor !== undefined && this.editor.hash === view?.hash && anchorInSnapshot(this.editor, view);
    const files = this.entries.filter((entry) => entry.type === "file");
    const fileIndex = files.findIndex((entry) => entry.path === view?.path);
    return html`<section class=${`review-panel ${this.preferences.layout}${this.preferences.wrapCode ? " wrap" : ""}`} aria-label="Code Review">
      <header class="review-header"><h2>Code review</h2><div class="review-actions">
        <span>${this.comments.length} saved <span class="draft-count">· ${this.editor === undefined ? "No draft" : "1 unsaved draft"}</span></span>
        <button class="ui-button primary attach" title="Attach saved comments as a chip; send from the conversation" ?disabled=${this.saving || this.comments.length === 0} @click=${() => { void this.attachReview(); }}>Attach review to composer</button>
        <button class="ui-button settings-button" @click=${() => { this.openDialog("settings"); }}>Review settings</button>
      </div></header>
      <div class="source-bar ui-toolbar"><div class="source-tabs ui-toolbar-group" role="group" aria-label="Review source selection">
        ${([ ["files", "Files"], ["git-unstaged", "Unstaged"], ["git-staged", "Staged"], ["git-compare", "Compare"] ] as const).map(([value, label]) => html`<button class="ui-button" data-source=${value} aria-pressed=${String(this.source === value)} @click=${() => { if (this.source !== value) this.selectSource(value); }}>${label}</button>`)}
      </div><button class="ui-button" @click=${() => { void this.refresh(); }}>Refresh</button></div>
      <div class="source-controls">
      ${this.source === "files" ? null : html`<label class="toolbar context-control">Diff context
        <select aria-label="Diff context" .value=${String(this.diffContext)} ?disabled=${this.viewLoading || this.editor !== undefined}
          title="Save or cancel an unfinished comment before changing context"
          @change=${(event: Event) => {
            if (!(event.target instanceof HTMLSelectElement)) return;
            const value = event.target.value;
            void this.changeDiffContext(value);
          }}>
          <option value="3">3 lines</option><option value="20">20 lines</option><option value="100">100 lines</option><option value="all">Whole file</option>
        </select>
      </label>`}
      ${this.source === "files" ? html`<details><summary>Open a file by path</summary><form class="toolbar" @submit=${(event: SubmitEvent) => {
        event.preventDefault(); const form = event.currentTarget;
        if (form instanceof HTMLFormElement) {
          const path = new FormData(form).get("path"); if (typeof path === "string") void this.openFile(path);
        }
      }}><label>File path <input name="path" placeholder="src/example.ts"></label><button class="ui-button">Open file</button></form></details>` : null}
      ${this.source !== "git-compare" ? null : html`<form class="toolbar" aria-label="Compare revisions" @submit=${(event: SubmitEvent) => { event.preventDefault(); void this.applyComparison(); }}>
        <label>Base revision <input name="base" required maxlength="256" .value=${this.baseRef} placeholder="main" @input=${(event: Event) => { if (event.target instanceof HTMLInputElement) this.baseRef = event.target.value; }}></label>
        <label>Target revision <input name="head" required maxlength="256" .value=${this.headRef} placeholder="HEAD" @input=${(event: Event) => { if (event.target instanceof HTMLInputElement) this.headRef = event.target.value; }}></label>
        <label>Comparison <select class="ui-select" name="mode" .value=${this.comparisonMode} @change=${(event: Event) => {
          if (event.target instanceof HTMLSelectElement && (event.target.value === "merge-base" || event.target.value === "direct")) this.comparisonMode = event.target.value;
        }}><option value="merge-base">Since merge base (A...B)</option><option value="direct">Between revisions (A..B)</option></select></label>
        <button class="ui-button">Compare</button>
      </form><details class="source-help"><summary>About revision comparisons</summary><p class="hint">Committed work only. Use main → HEAD with merge base for a branch review, or HEAD~3 → HEAD with between revisions for accumulated work. Compare or Refresh resolves revisions again; files use the frozen commits shown in their heading.</p></details>`}
      </div>
      ${this.error === "" ? null : html`<p class="notice" role="alert">${this.error}</p>`}
      ${this.preferenceError === "" ? null : html`<p class="notice" role="alert">${this.preferenceError}</p>`}
      ${Object.values(this.feedbackErrors).every((message) => message === "") ? null : html`
        ${Object.values(this.feedbackErrors).filter(Boolean).map((message) => html`<p class="notice" role="alert">${message}</p>`)}
        <button class="ui-button" @click=${() => { this.reportFeedbackError("", "acceptance"); this.reportFeedbackError("", "action"); this.reportFeedbackError("", "read"); }}>Dismiss feedback warning</button>`}
      <p class="notice" role="status" aria-live="polite">${this.listLoading || this.viewLoading || this.comparing !== undefined ? "Loading…" : this.notice}</p>
      <div class="review-workspace"><nav class="file-nav" aria-label="Review files">${this.renderFiles()}</nav><main class="viewer">
      <div class="view-tools"><button class="ui-button file-switch" @click=${() => { this.openDialog("files"); }} title=${view?.path ?? "Review files"}>${this.preferences.layout === "focus" ? view?.path.split("/").pop() ?? "Choose file" : `Files (${String(this.entries.length)})`} ▾</button>
        <button class="ui-button mobile-notes" @click=${() => { this.openDialog("notes"); }}>Notes (${this.comments.length})</button>
        <button class="ui-button file-step" aria-label="Previous file" ?disabled=${this.listLoading || fileIndex <= 0} @click=${() => { this.stepFile(-1); }}>←</button>
        <button class="ui-button file-step" aria-label="Next file" ?disabled=${this.listLoading || fileIndex >= files.length - 1} @click=${() => { this.stepFile(1); }}>→</button>
        <label class="wrap-control"><input type="checkbox" .checked=${this.preferences.wrapCode} @change=${(event: Event) => { if (event.target instanceof HTMLInputElement) this.setPreferences({ ...this.preferences, wrapCode: event.target.checked }); }}>Wrap code</label>
      </div>
      ${view === undefined ? html`<div class="empty-state"><h3>${this.viewLoading ? "Opening file…" : "Choose a file to start reviewing"}</h3><p>Select a file from the list or open a workspace-relative path above.</p></div>` : html`<div class="file-heading"><h3>${view.path}</h3><span class="hint">${sourceLabel(view.source, view.comparison)}</span></div>
        <div class="code" aria-label="Review source" aria-busy=${String(this.viewLoading)}>${view.rows.map((row) => {
          const anchor = row.line === undefined || row.side === undefined ? undefined : { path: view.path, source: view.source, side: row.side, start: row.line, end: row.line };
          const selected = anchor !== undefined && this.editor?.path === view.path && this.editor.source === view.source && this.editor.hash === view.hash
            && this.editor.side === row.side && anchor.start >= this.editor.start && anchor.start <= this.editor.end;
          const comments = anchor === undefined ? [] : this.comments.filter((comment) => comment.path === view.path && comment.source === view.source && comment.hash === view.hash && comment.side === row.side && comment.start === row.line);
          return html`<div class=${`row ${row.kind}${selected ? " selected" : ""}`}>
            ${anchor === undefined ? html`<span class="line"></span>` : html`<button class="line" aria-label=${`${row.side === "old" ? "Deleted" : "Current"} line ${String(row.line)}`} aria-pressed=${String(selected)} ?disabled=${this.viewLoading} @click=${(event: MouseEvent) => { this.selectLine(row, event.shiftKey); }}>${row.line}</button>`}
            <span class="sign" aria-hidden="true">${row.kind === "add" ? "+" : row.kind === "remove" ? "−" : ""}</span><code>${(isGitSource(view.source) && row.kind !== "meta" ? row.text.slice(1) : row.text) || " "}</code>
            ${comments.length === 0 ? null : html`<button class="comment-marker" aria-label=${`View ${String(comments.length)} saved comments at line ${String(row.line)}`} @click=${() => { this.openDialog("notes"); }}>${comments.length}</button>`}
          </div>${inlineEditor && this.editor?.side === row.side && this.editor?.start === row.line ? this.renderEditor() : null}${comments.map((comment) => html`<div class="inline-comment">${renderReviewMarkdown(html, comment.body)}<div class="toolbar"><button class="ui-button" ?disabled=${this.saving} @click=${() => { this.editComment(comment); }}>Edit comment</button></div></div>`)}`;
        })}</div>${view.rows.length === 0 ? html`<p class="notice">No text lines to review.</p>` : null}`}
      ${inlineEditor ? null : this.renderEditor()}
      <div class="hintbar"><span class="desktop-hint">Click a line number to comment · Shift-click to extend a range</span><span class="phone-hint">Tap a line number to comment · Adjust range in the editor</span></div>
      </main><aside class="saved-review" aria-label="Saved review"><details ?open=${this.preferences.layout === "workbench"}><summary>Saved comments (${this.comments.length})</summary>${this.renderSaved()}</details></aside></div>
      ${this.renderDialog()}
    </section>`;
  }
  static override styles = reviewStyles;
}
