import { LitElement, css, html, type PropertyValues } from "lit";
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
  private source: ReviewSource = "files";
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
    void this.refresh();
  }
  override disconnectedCallback(): void {
    this.connection++; this.feedbackRead++;
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
      if (source === "files") {
        const result = this.context.files.capabilityVersion === 1
          ? await this.context.files.readFile(path, { signal }) : await this.context.files.readFile(path);
        if (result.binary || result.truncated || result.content.length > MAX_TEXT_LENGTH) throw new Error("Binary, truncated, or oversized files cannot be reviewed inline");
        text = result.content;
      } else {
        const peer = this.context.peer;
        if (peer?.request === undefined) throw new Error("Git review backend unavailable");
        text = parseDiff(await peer.request("diff", { source, path, ...(comparison === undefined ? {} : { comparison: { ...comparison } }) }, { signal }));
      }
      const next = snapshot(path, source, text, comparison);
      if (signal.aborted) return;
      this.view = next;
      if (this.editor !== undefined) this.focusEditor = true;
      // Never attach an unfinished comment to refreshed or unrelated content.
      if (this.editor !== undefined && (this.editor.path !== path || this.editor.source !== source || this.editor.hash !== next.hash)) {
        this.notice = "The source changed. Your unfinished comment remains in the draft editor, but cannot be saved against this snapshot. Copy its text before cancelling.";
      }
    } catch (error) { if (!signal.aborted) { this.view = undefined; this.fail(error); } }
    finally { if (this.reading === controller) { this.viewLoading = false; this.requestUpdate(); } }
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
  private renderEditor() {
    const editor = this.editor;
    if (editor === undefined) return null;
    const valid = !this.viewLoading && editor.hash === this.view?.hash && anchorInSnapshot(editor, this.view);
    return html`<section class="editor" aria-label="Comment editor">
      <strong>${anchorLabel(editor)}</strong>
      <div class="toolbar"><label>Start line <input ?disabled=${this.saving} type="number" min="1" step="1" .value=${String(editor.start)} @input=${(event: Event) => { this.changeEditor("start", event); }}></label>
      <label>End line <input ?disabled=${this.saving} type="number" min="1" step="1" .value=${String(editor.end)} @input=${(event: Event) => { this.changeEditor("end", event); }}></label></div>
      ${valid ? null : html`<p role="alert">Choose a valid range in the current snapshot on one side. Omitted diff lines cannot be selected. Changed snapshots cannot be re-anchored automatically.</p>`}
      <label>Comment (Markdown)<textarea ?disabled=${this.saving} rows="4" .value=${editor.body} @input=${(event: Event) => { this.changeEditor("body", event); }} @keydown=${(event: KeyboardEvent) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.isComposing) { event.preventDefault(); void this.saveEditor(); }
      }}></textarea></label>
      <div class="toolbar"><button class="primary" ?disabled=${this.saving || !valid || editor.body.trim() === ""} @click=${() => { void this.saveEditor(); }}>Save comment</button>
      <button ?disabled=${this.saving} @click=${() => { this.editor = undefined; this.notice = ""; this.requestUpdate(); }}>Cancel edit</button><span class="hint">Ctrl / ⌘ + Enter to save</span></div>
    </section>`;
  }
  override render() {
    const view = this.view;
    const inlineEditor = this.editor !== undefined && this.editor.hash === view?.hash && anchorInSnapshot(this.editor, view);
    return html`<section class="review-panel" aria-label="Code Review">
      <header class="review-header"><div><h2>Code Review</h2><p class="hint">Review files. Comment in context. Share when ready.</p></div>
        <div class="review-actions"><span>${this.comments.length} saved · ${this.editor === undefined ? "No draft" : "1 unsaved draft"}</span>
        <button class="primary" ?disabled=${this.saving || this.comments.length === 0} @click=${() => { void this.attachReview(); }}>Attach review to composer</button>
        <span class="hint">Saved comments only · send from the conversation</span></div>
      </header>
      <div class="source-controls"><div class="toolbar"><label>Source <select .value=${this.source} @change=${(event: Event) => { if (event.target instanceof HTMLSelectElement) this.selectSource(event.target.value); }}>
        <option value="files">Files (including untracked)</option><option value="git-unstaged">Git unstaged</option><option value="git-staged">Git staged</option><option value="git-compare">Compare revisions</option>
      </select></label><button @click=${() => { void this.refresh(); }}>Refresh</button></div>
      ${this.source === "files" ? html`<form class="toolbar" @submit=${(event: SubmitEvent) => {
        event.preventDefault(); const form = event.currentTarget;
        if (form instanceof HTMLFormElement) {
          const path = new FormData(form).get("path"); if (typeof path === "string") void this.openFile(path);
        }
      }}><label>File path <input name="path" placeholder="src/example.ts"></label><button>Open file</button></form>` : null}
      ${this.source !== "git-compare" ? null : html`<form class="toolbar" aria-label="Compare revisions" @submit=${(event: SubmitEvent) => { event.preventDefault(); void this.applyComparison(); }}>
        <label>Base revision <input name="base" required maxlength="256" .value=${this.baseRef} placeholder="main" @input=${(event: Event) => { if (event.target instanceof HTMLInputElement) this.baseRef = event.target.value; }}></label>
        <label>Target revision <input name="head" required maxlength="256" .value=${this.headRef} placeholder="HEAD" @input=${(event: Event) => { if (event.target instanceof HTMLInputElement) this.headRef = event.target.value; }}></label>
        <label>Comparison <select name="mode" .value=${this.comparisonMode} @change=${(event: Event) => {
          if (event.target instanceof HTMLSelectElement && (event.target.value === "merge-base" || event.target.value === "direct")) this.comparisonMode = event.target.value;
        }}><option value="merge-base">Branch changes since merge base (A...B)</option><option value="direct">Between revisions (A..B)</option></select></label>
        <button>Compare</button>
      </form><p>Compare committed work only. Use main → HEAD with merge base for a branch review, or a commit → HEAD with between revisions for accumulated work. Branch names, tags, commit IDs, and HEAD~3 are supported. Compare or Refresh resolves revisions again; opening files uses the frozen commits shown below.</p>`}
      </div>
      ${this.error === "" ? null : html`<p role="alert">${this.error}</p>`}
      ${Object.values(this.feedbackErrors).every((message) => message === "") ? null : html`
        ${Object.values(this.feedbackErrors).filter(Boolean).map((message) => html`<p role="alert">${message}</p>`)}
        <button @click=${() => { this.reportFeedbackError("", "acceptance"); this.reportFeedbackError("", "action"); this.reportFeedbackError("", "read"); }}>Dismiss feedback warning</button>`}
      <p role="status" aria-live="polite">${this.listLoading || this.viewLoading || this.comparing !== undefined ? "Loading…" : this.notice}</p>
      <div class="review-workspace"><nav aria-label="Review files"><details class="file-list" open><summary>${this.source === "files" ? this.directory || "Workspace files" : `${sourceLabel(this.source, this.comparison)} files`}</summary>
        ${this.source === "files" && this.directory !== "" ? html`<button @click=${() => { this.directory = this.directory.split("/").slice(0, -1).join("/"); void this.loadList(); }}>Parent directory</button>` : null}
        ${this.entries.map((entry) => html`<button aria-current=${entry.path === view?.path ? "page" : "false"} ?disabled=${this.listLoading} @click=${() => {
          if (entry.type === "directory") { this.directory = entry.path; void this.loadList(); }
          else void this.openFile(entry.path);
        }}>${entry.type === "directory" ? "📁 " : ""}${entry.name}</button>`)}
        ${!this.listLoading && this.comparing === undefined && this.entries.length === 0 ? html`<p>No files in this view.</p>` : null}
      </details></nav><main class="viewer">
      ${view === undefined ? html`<div class="empty-state"><h3>${this.viewLoading ? "Opening file…" : "Choose a file to start reviewing"}</h3><p>Select a file from the list or open a workspace-relative path above.</p></div>` : html`<div class="file-heading"><h3>${view.path}</h3><span class="hint">${sourceLabel(view.source, view.comparison)}</span><p class="hint">Click a line number to comment. Shift-click to extend the range, or use the editor’s line fields.</p></div>
        <div class="code" aria-label="Review source" aria-busy=${String(this.viewLoading)}>${view.rows.map((row) => {
          const anchor = row.line === undefined || row.side === undefined ? undefined : { path: view.path, source: view.source, side: row.side, start: row.line, end: row.line };
          const selected = anchor !== undefined && this.editor?.path === view.path && this.editor.source === view.source && this.editor.hash === view.hash
            && this.editor.side === row.side && anchor.start >= this.editor.start && anchor.start <= this.editor.end;
          const comments = anchor === undefined ? [] : this.comments.filter((comment) => comment.path === view.path && comment.source === view.source && comment.hash === view.hash && comment.side === row.side && comment.start === row.line);
          return html`<div class=${`row ${row.kind}${selected ? " selected" : ""}`}>
            ${anchor === undefined ? html`<span class="line"></span>` : html`<button class="line" aria-label=${`${row.side === "old" ? "Deleted" : "Current"} line ${String(row.line)}`} aria-pressed=${String(selected)} ?disabled=${this.viewLoading} @click=${(event: MouseEvent) => { this.selectLine(row, event.shiftKey); }}>${row.line}</button>`}
            <code>${row.text || " "}</code></div>${inlineEditor && this.editor?.side === row.side && this.editor?.start === row.line ? this.renderEditor() : null}${comments.map((comment) => html`<div class="inline-comment">${renderReviewMarkdown(html, comment.body)}</div>`)}`;
        })}</div>${view.rows.length === 0 ? html`<p>No text lines to review.</p>` : null}`}
      ${inlineEditor ? null : this.renderEditor()}
      </main></div>
      <section class="saved-review" aria-label="Saved review"><h3>Saved comments (${this.comments.length})</h3>
      <p class="hint">Saved locally until sent. Failed sends retain feedback; acceptance clears unchanged submitted comments.</p>
      ${this.comments.length === 0 ? html`<p class="hint">No comments yet. Click a line number in the file viewer to add one.</p>` : null}
      ${this.comments.map((comment) => html`<article><strong>${anchorLabel(comment)}</strong>
        ${comment.path === view?.path && comment.source === view.source && comment.hash !== view.hash ? html`<p class="stale">Source changed since this comment was saved. Verify its coordinates before sending.</p>` : null}
        <div class="markdown">${renderReviewMarkdown(html, comment.body)}</div>
        <div class="toolbar"><button ?disabled=${this.saving} @click=${() => { this.editComment(comment); }}>Edit comment</button><button ?disabled=${this.saving} @click=${() => { void this.removeComment(comment); }}>Remove comment</button></div>
      </article>`)}
      <details><summary>Feedback Markdown</summary><textarea aria-label="Feedback Markdown" readonly rows="8" .value=${reviewMarkdown(this.comments)}></textarea></details>
    </section></section>`;
  }
  static override styles = css`
    :host { display: block; color: var(--pi-text, #ddd); font: 14px system-ui, sans-serif; }
    * { box-sizing: border-box; }
    :host { container-type: inline-size; width: 100%; min-width: 0; }
    .review-panel { padding: 16px; } h2, h3 { margin: 0; } p { line-height: 1.5; }
    .hint { color: var(--pi-muted, #aaa); font-size: 12px; }
    .review-header { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; border-bottom: 1px solid var(--pi-border, #666); padding-bottom: 16px; }
    .review-header p { margin: 6px 0 0; }
    .review-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
    .source-controls { display: flex; flex-wrap: wrap; align-items: end; gap: 8px 20px; padding: 8px 0; }
    .source-controls form { flex: 1; } .source-controls label { flex: 1; min-width: 140px; }
    .source-controls > p { flex-basis: 100%; margin: 0; font-size: 12px; color: var(--pi-muted, #aaa); }
    .review-workspace { display: grid; grid-template-columns: minmax(160px, 22%) minmax(0, 1fr); border: 1px solid var(--pi-border, #666); border-radius: 8px; overflow: hidden; }
    nav { background: var(--pi-surface, #222); border-right: 1px solid var(--pi-border, #666); min-width: 0; padding: 12px; }
    .viewer { min-width: 0; }
    .file-heading { padding: 12px 16px; overflow-wrap: anywhere; } .file-heading p { margin-bottom: 0; }
    .empty-state { padding: 48px 24px; text-align: center; color: var(--pi-muted, #aaa); }
    .saved-review { margin-top: 24px; } summary { cursor: pointer; overflow-wrap: anywhere; }
    [role=status]:empty { display: none; }
    @container (max-width: 640px) {
      .review-panel { padding: 10px; } .review-workspace { grid-template-columns: minmax(0, 1fr); }
      nav { border-right: 0; border-bottom: 1px solid var(--pi-border, #666); }
      .review-actions { align-items: flex-start; } .file-list { max-height: 150px !important; }
    }
    .toolbar { display: flex; flex-wrap: wrap; align-items: end; gap: 8px; margin: 8px 0; }
    label { display: flex; flex-direction: column; gap: 4px; }
    button, select, input, textarea { color: inherit; background: var(--pi-surface, #222); border: 1px solid var(--pi-border, #666); border-radius: 4px; padding: 6px; font: inherit; }
    button { cursor: pointer; } button:hover:not(:disabled) { border-color: var(--pi-accent, #6cf); }
    .primary { background: var(--pi-accent, #6cf); color: var(--pi-surface, #222); border-color: transparent; font-weight: 600; }
    :is(button, input, select, textarea):focus-visible { outline: 2px solid var(--pi-accent, #6cf); outline-offset: 2px; }
    button:disabled { opacity: .5; cursor: default; } button:focus-visible { outline: 2px solid var(--pi-accent, #6cf); }
    textarea { box-sizing: border-box; width: 100%; resize: vertical; } input[type=number] { width: 6em; }
    .file-list { max-height: 65vh; overflow: auto; } .file-list button { display: block; width: 100%; text-align: left; margin: 4px 0; overflow-wrap: anywhere; border-color: transparent; background: transparent; }
    .file-list button[aria-current=page] { background: var(--pi-selection-bg, #336699); border-color: var(--pi-accent, #6cf); }
    .code { max-height: 65vh; overflow: auto; border-top: 1px solid var(--pi-border, #666); }
    .code .editor, .code .inline-comment { position: sticky; left: 0; width: calc(100% - 24px); margin: 10px 12px; background: var(--pi-surface, #222); }
    .editor { border-left: 3px solid var(--pi-accent, #6cf) !important; }
    .editor strong { display: block; margin-bottom: 8px; }
    .row { display: flex; min-width: max-content; } .row code { white-space: pre; padding: 2px 8px; font: 12px ui-monospace, monospace; }
    .line { flex: 0 0 4em; border-radius: 0; padding: 2px; font: 12px ui-monospace, monospace; text-align: right; }
    .add { background: #22883325; } .remove { background: #bb222225; } .meta { color: var(--pi-muted, #999); }
    .selected { background: var(--pi-selection-bg, #336699); } .inline-comment, article, .editor { padding: 10px; margin: 8px 0; border: 1px solid var(--pi-border, #666); border-radius: 6px; white-space: normal; overflow-wrap: anywhere; }
    .inline-comment { max-width: 75ch; } [role=alert], .stale { color: var(--pi-warning, #ecb65b); }
    .markdown pre, .inline-comment pre { overflow: auto; } a { color: var(--pi-accent, #6cf); }
  `;
}
