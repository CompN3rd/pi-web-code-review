import { css } from "lit";

export const reviewStyles = css`
  :host { display: block; width: 100%; min-width: 0; container-type: inline-size; color: var(--pi-text, #e5e7ee); font: 14px var(--pi-font, system-ui, sans-serif); }
  * { box-sizing: border-box; }
  .review-panel { --review-border: var(--pi-border, #353943); --review-muted: var(--pi-muted, #989eaf); --review-surface: var(--pi-surface, #1e2128); --review-accent: var(--pi-accent, #a4b7fa); background: var(--pi-bg, #16181d); }
  h2, h3, p { margin: 0; } p { line-height: 1.6; }
  button, select, input, textarea { font: inherit; color: inherit; }
  button, select, input, textarea { background: var(--review-surface); border: 1px solid var(--review-border); border-radius: 5px; padding: 7px 10px; }
  button { cursor: pointer; } button:disabled { opacity: .5; cursor: default; }
  button:hover:not(:disabled) { border-color: var(--review-accent); }
  :is(button, select, input, textarea, summary):focus-visible { outline: 2px solid var(--review-accent); outline-offset: 2px; }
  button.primary { background: var(--review-accent); color: var(--pi-bg, #16181d); border-color: transparent; font-weight: 600; }
  .hint { color: var(--review-muted); font-size: 12px; }
  .review-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 20px; }
  .review-header h2 { font-size: 20px; letter-spacing: -.4px; }
  .review-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; font-size: 12px; }
  .draft-count { color: var(--pi-warning, #d1bb90); }
  .source-bar { display: flex; align-items: stretch; justify-content: space-between; border-block: 1px solid var(--review-border); }
  .source-tabs { display: flex; min-width: 0; flex-wrap: wrap; }
  .source-tabs button { border: 0; border-right: 1px solid var(--review-border); border-radius: 0; padding: 8px 16px; min-height: 36px; background: transparent; color: var(--review-muted); }
  .source-tabs button[aria-pressed=true] { color: var(--pi-text, #e5e7ee); background: color-mix(in srgb, var(--review-accent) 15%, transparent); box-shadow: inset 0 -2px var(--review-accent); }
  .source-bar > button { border: 0; border-radius: 0; background: transparent; }
  .source-controls { padding: 0 16px; }
  .toolbar { display: flex; align-items: end; flex-wrap: wrap; gap: 10px; margin: 10px 0; }
  .source-controls .toolbar > label { flex: 1; min-width: 120px; }
  label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; }
  .source-controls input, .source-controls select { width: 100%; min-width: 0; }
  .source-controls .context-control { flex-direction: row; align-items: center; justify-content: flex-start; }
  .source-controls .context-control select { width: auto; min-width: 150px; }
  .source-controls details { margin: 10px 0; } summary { cursor: pointer; overflow-wrap: anywhere; }
  .source-help { margin: 10px 0; }
  .notice { padding: 12px 16px; overflow-wrap: anywhere; } .notice:empty { display: none; }
  [role=alert], .stale { color: var(--pi-warning, #ecb65b); }
  .review-workspace { display: grid; grid-template-columns: minmax(160px, 19%) minmax(0, 1fr) minmax(220px, 24%); }
  .file-nav { background: var(--review-surface); border-right: 1px solid var(--review-border); min-width: 0; padding: 12px 8px; }
  .file-list > summary { font-size: 12px; padding: 8px; color: var(--review-muted); }
  .file-list { max-height: 65vh; overflow: auto; }
  .file-list button { display: flex; align-items: center; width: 100%; min-height: 32px; text-align: left; border: 0; background: transparent; padding: 8px; font-size: 12px; }
  .file-list button[aria-current=page] { background: color-mix(in srgb, var(--review-accent) 20%, transparent); }
  .file-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .viewer { min-width: 0; }
  .file-heading { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 14px 16px; border-bottom: 1px solid var(--review-border); overflow-wrap: anywhere; }
  .file-heading h3 { font-size: 13px; min-width: 0; }
  .file-heading .hint { flex-basis: 100%; font-size: 11px; }
  .view-tools { display: flex; gap: 8px; align-items: center; padding: 8px 16px; border-bottom: 1px solid var(--review-border); }
  .view-tools .file-switch { display: none; }
  .view-tools .wrap-control { margin-left: auto; }
  .wrap-control { flex-direction: row; align-items: center; min-height: 32px; color: var(--review-muted); white-space: nowrap; }
  input[type=checkbox], input[type=radio] { accent-color: var(--review-accent); width: 17px; height: 17px; }
  .mobile-notes { display: none; }
  .file-step { min-width: 32px; }
  .code { max-height: 70vh; overflow: auto; }
  .row { display: flex; align-items: stretch; width: max-content; min-width: 100%; font: 12px var(--pi-mono, ui-monospace, monospace); line-height: 1.8; }
  .row code { white-space: pre; padding: 3px 10px 3px 0; font: inherit; }
  .line { flex: 0 0 44px; width: 44px; align-self: stretch; border: 0; border-radius: 0; background: transparent; color: var(--review-muted); padding: 3px 8px; font: inherit; text-align: right; }
  .sign { flex: 0 0 20px; padding-top: 3px; color: var(--review-muted); }
  .wrap .row { width: 100%; min-width: 0; } .wrap .row code { white-space: pre-wrap; overflow-wrap: anywhere; min-width: 0; }
  .add { background: color-mix(in srgb, var(--pi-success, #4ba36a) 16%, transparent); }
  .remove { background: color-mix(in srgb, var(--pi-danger, #d85d6b) 16%, transparent); }
  .meta { color: var(--review-muted); background: color-mix(in srgb, var(--review-accent) 8%, transparent); }
  .selected { background: color-mix(in srgb, var(--review-accent) 25%, transparent); }
  .comment-marker { align-self: center; margin: 0 8px 0 auto; min-width: 28px; font-size: 11px; padding: 2px 6px; }
  .editor, .inline-comment, article { padding: 14px; background: var(--review-surface); border: 1px solid var(--review-border); border-radius: 7px; overflow-wrap: anywhere; }
  .editor { border-color: var(--review-accent); margin: 12px; }
  .code .editor, .code .inline-comment { position: sticky; left: 12px; width: calc(100% - 24px); margin: 12px; }
  .editor strong { font-size: 12px; display: block; margin-bottom: 12px; }
  .editor textarea { width: 100%; min-height: 90px; resize: vertical; background: var(--pi-bg, #16181d); line-height: 1.6; }
  .editor .range { margin: 12px 0; color: var(--review-muted); font-size: 12px; }
  input[type=number] { width: 6em; }
  .editor .toolbar { margin-bottom: 0; }
  .inline-comment { font-size: 12px; line-height: 1.7; }
  .inline-comment .toolbar { margin-bottom: 0; }
  .workbench .inline-comment { display: none; }
  .hintbar { padding: 12px 16px; border-top: 1px solid var(--review-border); font-size: 11px; color: var(--review-muted); }
  .phone-hint { display: none; }
  .saved-review { min-width: 0; background: var(--review-surface); border-left: 1px solid var(--review-border); padding: 18px 14px; }
  .saved-review > details > summary { font-size: 13px; font-weight: 600; }
  .saved-review p.hint { margin: 12px 0; }
  article { margin: 12px 0; font-size: 12px; }
  article strong { font-size: 11px; }
  .markdown { margin: 10px 0; line-height: 1.7; }
  .markdown p, .inline-comment p { margin: 8px 0; }
  .markdown pre, .inline-comment pre { overflow: auto; }
  a { color: var(--review-accent); }
  .markdown-export textarea { width: 100%; margin-top: 10px; }
  .empty-state { padding: 48px 20px; text-align: center; color: var(--review-muted); }
  .empty-state h3 { margin-bottom: 10px; font-size: 17px; }
  .focus .review-workspace { display: block; max-width: 1100px; margin: 0 auto; }
  .focus .file-nav { display: none; }
  .focus .view-tools .file-switch { display: inline-block; max-width: 55%; overflow: hidden; text-overflow: ellipsis; }
  .focus .saved-review { border: 1px solid var(--review-border); border-radius: 6px; margin: 16px; }
  dialog { color: var(--pi-text, #e5e7ee); background: var(--review-surface); border: 1px solid var(--review-border); border-radius: 12px; padding: 24px; width: min(480px, calc(100% - 24px)); max-height: 85dvh; overflow: auto; box-shadow: 0 24px 80px #0006; }
  dialog::backdrop { background: #090c14a8; }
  .dialog-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
  .dialog-heading h2 { font-size: 18px; }
  .dialog-heading button { min-height: 44px; min-width: 44px; }
  .layout-option { display: flex; flex-direction: row; align-items: start; gap: 12px; padding: 16px; border: 1px solid var(--review-border); border-radius: 7px; margin: 12px 0; cursor: pointer; }
  .layout-option:has(:checked) { border-color: var(--review-accent); background: color-mix(in srgb, var(--review-accent) 12%, transparent); }
  .layout-option .hint { display: block; margin-top: 6px; line-height: 1.7; }
  .layout-option input { flex-shrink: 0; }
  .settings-status { margin: 10px 0; }
  .settings-save { width: 100%; margin-top: 16px; min-height: 44px; }
  .sheet .file-list { max-height: none; }
  .sheet .file-list button { min-height: 48px; }
  .sheet .saved-review { padding: 0; border: 0; }
  @container (max-width: 1000px) {
    .review-workspace { grid-template-columns: minmax(150px, 24%) minmax(0, 1fr); }
    .saved-review { grid-column: 1 / -1; border-left: 0; border-top: 1px solid var(--review-border); }
    .review-header { flex-wrap: wrap; }
  }
  @container (max-width: 640px) {
    .review-header { display: grid; grid-template-columns: minmax(0, 1fr) auto; padding: 12px; gap: 12px 8px; }
    .review-header h2 { font-size: 18px; }
    .review-actions { display: contents; }
    .review-actions > span { grid-row: 2; font-size: 11px; }
    .review-actions .attach { grid-row: 2; grid-column: 2; max-width: 100%; font-size: 11px; }
    .review-actions .settings-button { grid-row: 1; grid-column: 2; justify-self: end; font-size: 11px; }
    .source-tabs { flex: 1; }
    .source-tabs button { flex: 1; min-height: 44px; padding: 8px; font-size: 12px; }
    .source-bar > button { font-size: 12px; }
    .review-workspace, .focus .review-workspace { display: block; margin: 0; }
    .file-nav, .workbench .saved-review { display: none; }
    .view-tools { padding: 10px 12px; flex-wrap: wrap; }
    .view-tools .file-switch, .mobile-notes { display: inline-block; }
    .view-tools .file-switch { max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .view-tools .file-step { display: none; }
    .file-heading { padding: 12px; }
    .code { max-height: none; }
    .row { min-height: 44px; }
    .line { min-height: 44px; flex-basis: 36px; width: 36px; }
    .row code { padding-top: 10px; } .sign { padding-top: 10px; flex-basis: 18px; }
    .editor textarea { font-size: 16px; min-height: 130px; }
    .editor strong { font-size: 11px; }
    .editor .range summary { padding: 8px 0; min-height: 44px; }
    input, select { font-size: 16px; }
    .toolbar button, .review-actions button, .view-tools button { min-height: 44px; }
    .editor .hint, .desktop-hint { display: none; }
    .phone-hint { display: inline; }
    .comment-marker { min-height: 44px; min-width: 32px; }
    .inline-comment { font-size: 13px; }
    .sheet .saved-review { display: block; }
    .sheet .file-list button { min-height: 56px; }
  }
  @media (max-width: 640px) {
    dialog.sheet { margin: auto 0 0; width: 100%; max-width: none; max-height: 80dvh; border-radius: 16px 16px 0 0; padding: 20px 20px max(24px, env(safe-area-inset-bottom)); }
  }
  @media (pointer: coarse) { button, select { min-height: 44px; } }
`;
