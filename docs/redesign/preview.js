import { ReviewPanel } from '../../src/browser/panel.ts';
import { LitElement } from 'lit';
const requested = new URLSearchParams(location.search).get('design');
let design = ['current', 'a', 'b'].includes(requested) ? requested : localStorage.getItem('review-study-layout') === 'b' ? 'b' : 'a';
let draftText = 'Can we add a test for switching sessions while setChip is pending?';
let editorOpen = true;
const files = ['src/browser/chips.ts', 'src/browser/panel.ts', 'test/chips.test.ts', 'docs/usage.md'];
const lines = [
 ['meta', '', '@@ -84,10 +84,14 @@ async attach(context)'],
 ['context', 84, '  const comments = await store.load(key);'],
 ['context', 85, '  if (comments.length === 0) return;'],
 ['context', 86, ''],
 ['remove', 87, '  await prompt.insertText(reviewMarkdown(comments));'],
 ['add', 87, '  const revision = selectionRevision;'],
 ['add', 88, '  if (!isCurrent()) return;'],
 ['add', 89, '  await prompt.setChip({'],
 ['add', 90, '    id: reviewChipId(key),'],
 ['add', 91, '    label: `Review (${comments.length})`,'],
 ['add', 92, '    payload: freezeReview(comments),'],
 ['add', 93, '  });'],
 ['context', 94, ''],
 ['context', 95, '  // Keep saved feedback until server acceptance.'],
 ['context', 96, '  pending.set(key, { revision, comments });'],
 ['context', 97, '}'],
];
const body = 'Keep this guard after the async read so switching conversations cannot attach feedback to the wrong session.';
const draft = draftText;
const view = {path: files[0], source: 'git-unstaged', hash: 'a'.repeat(64), rows: lines.map(([kind,line,text])=>({kind,line:line || undefined,text,side:line ? kind==='remove'?'old':'new':undefined}))};
const comments = [{id:'one',path:files[0],source:view.source,hash:view.hash,side:'new',start:88,end:88,body,createdAt:1}];
const app = document.querySelector('#app');
if (design === 'current') {
  class PreviewCurrent extends ReviewPanel { connectedCallback() { LitElement.prototype.connectedCallback.call(this); } }
  customElements.define('preview-current', PreviewCurrent);
  const panel = new PreviewCurrent();
  Object.assign(panel, {source:view.source,view,comments,entries:files.map(path=>({path,name:path,type:'file'})),editor:{path:files[0],source:view.source,hash:view.hash,side:'new',start:93,end:93,body:draft}});
  app.append(panel);
  await panel.updateComplete;
} else {
  renderConcept(design);
}
function renderConcept(design) {
  const esc = text => String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const saved = `<article class="feedback"><div class="eyebrow"><span class="dot"></span> SAVED COMMENT <span class="right">L88</span></div><p>${body}</p><div class="actions"><button>Edit</button><button>Remove</button></div></article>`;
  const editor = `<section class="draft"><div class="eyebrow">NEW COMMENT <span class="right">Line 93 · unsaved</span></div><textarea aria-label="Draft comment">${esc(draftText)}</textarea><details class="range"><summary>Line range · 93–93</summary><label>Start <input type="number" min="1" value="93"></label><label>End <input type="number" min="1" value="93"></label><small>Range fields are illustrative in this prototype.</small></details><footer><button class="primary" id="save">Save comment</button><button id="cancel">Cancel</button><small class="right">Ctrl / ⌘ + Enter</small></footer></section>`;
  const code = `<div class="codeview"><div class="hunk">${esc(lines[0][2])}<span class="right">− old / + new</span></div>${lines.slice(1).map(([kind,line,text])=>`<div class="code-row ${kind}"><span class="number">${line}</span><span class="sign">${kind==='add'?'+':kind==='remove'?'−':''}</span><code>${esc(text)}</code>${line===88&&kind==='add'?'<span class="marker">1</span>':''}</div>${design==='b'&&line===88&&kind==='add'?`<div class="inline">${saved}</div>`:''}${line===93&&editorOpen?`<div class="inline">${editor}</div>`:''}`).join('')}</div>`;
  const fileList = `<div class="files"><div class="eyebrow">CHANGED FILES <span class="right">4</span></div>${files.map((path,i)=>`<button class="file ${i===0?'selected':''}" title="${path}"><span class="fileicon">${i===3?'≡':'TS'}</span><span>${path.split('/').pop()}<small>${path.substring(0,path.lastIndexOf('/'))}</small></span><span class="right">${i===0?'1 · M':'M'}</span></button>`).join('')}</div>`;
  app.className = `concept ${design}`;
  app.innerHTML = `<header class="heading"><div><h1>${design==='a'?'Code review':'Review changes'}</h1>${design==='b'?'<p>One file at a time. Feedback stays beside the code.</p>':''}</div><span class="right counts">1 saved <span>· 1 draft</span></span><button class="primary attach">Attach review <span class="badge">1</span> ↗</button></header><div class="controls"><div class="segments"><button>Files</button><button class="active">Unstaged</button><button>Staged</button><button>Compare</button></div><span class="right muted">4 changed files</span><button title="Refresh changes">↻ Refresh</button></div>${design==='a'?`<div class="workspace">${fileList}<main class="diff"><div class="filebar"><b>chips.ts</b><span class="muted">src / browser</span><span class="right delta">+7 <em>−1</em></span></div>${code}<div class="hintbar">Click a line to comment · Shift-click to select a range</div></main><aside><div class="rail-title"><b>Review notes</b><span class="badge">1</span></div><p class="muted rail-sub">Saved locally · not sent</p>${saved}<div class="draft-note">◌ &nbsp; 1 unsaved draft <small>chips.ts · Line 93</small></div><div class="rail-help">Only saved comments attach.<br>Send from your conversation.</div></aside></div>`:`<div class="focus-wrap"><div class="focus-navigation"><details><summary><b>chips.ts</b> <span class="muted">src / browser</span> ▾</summary>${fileList}</details><span class="right muted">File 1 of 4</span><button disabled>←</button><button title="Next file (visual prototype)">→</button></div><main class="diff">${code}</main><div class="hintbar">Click a line to comment · Shift-click to select a range</div><details class="tray"><summary><b>Review summary</b><span>1 saved comment · 1 unsaved draft</span><span class="right">Expand ↑</span></summary>${saved}</details><div class="focus-foot">Saved on this device. Attach adds a review chip; it does not send a message.</div></div>`}`;
  const mobilebar = document.createElement('div');
  mobilebar.className = 'mobilebar';
  mobilebar.innerHTML = `<button data-sheet="files">${design === 'a' ? '☰ Files · 4' : 'chips.ts ▾'}</button><button data-sheet="notes">Notes · 1</button><label><input type="checkbox" checked id="wrap"> Wrap code</label>`;
  app.querySelector('.controls').after(mobilebar);
  app.classList.add('wrap-code');
  mobilebar.querySelector('#wrap').onchange = event => app.classList.toggle('wrap-code', event.target.checked);
  mobilebar.querySelectorAll('[data-sheet]').forEach(button => button.onclick = () => {
    const dialog = document.querySelector('#mobile-sheet');
    const isFiles = button.dataset.sheet === 'files';
    dialog.querySelector('h2').textContent = isFiles ? 'Changed files' : 'Review notes';
    dialog.querySelector('.sheet-content').innerHTML = isFiles ? fileList + '<p class="muted">File selection is illustrative in this prototype.</p>' : saved + '<p class="muted">1 unsaved draft · chips.ts:93<br>Only saved comments attach. Your draft stays here.</p>';
    dialog.showModal();
  });
  app.querySelectorAll('.hintbar').forEach(hint => hint.innerHTML = '<span class="desktop-hint">Click a line to comment · Shift-click to select a range</span><span class="phone-hint">Tap a line number to comment · Adjust range in the editor</span>');
  document.querySelector('.attach').onclick = () => alert('Preview only: production will attach saved comments to the selected conversation, without sending.');
  const cancel = document.querySelector('#cancel');
  if (cancel) cancel.onclick = () => { editorOpen = false; document.querySelector('.draft').remove(); };
  const save = document.querySelector('#save');
  if (save) save.onclick = () => alert('Visual prototype: draft persistence is not connected.');
}
if (design !== 'current') {
  document.body.insertAdjacentHTML('beforeend', `<dialog id="review-settings" aria-labelledby="settings-title"><form method="dialog"><div class="dialog-heading"><h2 id="settings-title">Review settings</h2><button aria-label="Close settings">✕</button></div><p class="muted">Layout · saved for this browser's preview</p><label class="layout-option"><input type="radio" name="layout" value="a"><span><b>Workbench</b><small>Files, code and notes side by side.<br>On phones: files and notes open as sheets.</small></span></label><label class="layout-option"><input type="radio" name="layout" value="b"><span><b>Focus</b><small>A wide code view with inline feedback.<br>On phones: one file at a time.</small></span></label><p class="settings-note">Switch layouts without losing your current draft. This preview setting does not change PI WEB settings.</p><button class="primary" id="apply-layout">Apply layout</button></form></dialog><dialog id="mobile-sheet" aria-labelledby="sheet-title"><div class="dialog-heading"><h2 id="sheet-title">Changed files</h2><button id="close-sheet" aria-label="Close sheet">✕</button></div><div class="sheet-content"></div></dialog>`);
  const button = document.createElement('button');
  button.className = 'settings-trigger';
  button.textContent = '⚙ Review settings';
  button.onclick = () => {
    const dialog = document.querySelector('#review-settings');
    dialog.querySelector(`input[value="${design}"]`).checked = true;
    dialog.showModal();
  };
  document.querySelector('.study').append(button);
  document.querySelector('#apply-layout').onclick = () => {
    draftText = app.querySelector('textarea')?.value ?? draftText;
    design = document.querySelector('input[name="layout"]:checked').value;
    localStorage.setItem('review-study-layout', design);
    const url = new URL(location.href); url.searchParams.set('design', design); history.replaceState(null, '', url);
    renderConcept(design);
  };
  document.querySelector('#close-sheet').onclick = () => document.querySelector('#mobile-sheet').close();
}
window.previewReady = true;
