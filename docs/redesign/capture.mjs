// Run: node docs/redesign/capture.mjs <absolute path to playwright/index.mjs>
// Playwright is deliberately not added to the production package dependencies.
import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const server = await createServer({ configFile: false, root: process.cwd(), server: { host: '127.0.0.1', port: 5198, strictPort: true } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await mkdir('docs/redesign/screenshots', { recursive: true });
  for (const design of ['current', 'a', 'b']) {
    await page.goto(`http://127.0.0.1:5198/docs/redesign/?design=${design}`);
    await page.waitForFunction(() => window.previewReady);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `docs/redesign/screenshots/${design}.png`, fullPage: true });
    console.log(`${design}: captured`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const design of ['a', 'b']) {
    await page.goto(`http://127.0.0.1:5198/docs/redesign/?design=${design}`);
    await page.waitForFunction(() => window.previewReady);
    await page.screenshot({ path: `docs/redesign/screenshots/${design}-phone.png` });
    await page.screenshot({ path: `docs/redesign/screenshots/${design}-phone-full.png`, fullPage: true });
    if (design === 'a') {
      await page.click('[data-sheet="files"]');
      await page.screenshot({ path: 'docs/redesign/screenshots/phone-files.png' });
      await page.click('#close-sheet');
      await page.click('[data-sheet="notes"]');
      await page.screenshot({ path: 'docs/redesign/screenshots/phone-notes.png' });
      await page.click('#close-sheet');
    }
    await page.locator('.draft').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `docs/redesign/screenshots/${design}-phone-editor.png` });
    console.log(`${design}: phone states captured`);
  }
  await page.evaluate(() => scrollTo(0, 0));
  await page.click('.settings-trigger');
  await page.screenshot({ path: 'docs/redesign/screenshots/phone-settings.png' });
  await page.keyboard.press('Escape');
  await page.locator('.draft textarea').fill('Draft preserved across layout changes.');
  await page.click('.settings-trigger');
  await page.check('input[name="layout"][value="a"]');
  await page.click('#apply-layout');
  if (await page.locator('.draft textarea').inputValue() !== 'Draft preserved across layout changes.') throw new Error('Layout change lost draft');
  if (await page.locator('#review-settings').evaluate(el => el.open)) throw new Error('Settings failed to close');
  await page.goto('http://127.0.0.1:5198/docs/redesign/');
  await page.waitForFunction(() => window.previewReady);
  if (!await page.locator('#app.a').count()) throw new Error('Layout preference not persisted');
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const design of ['a', 'b']) {
      await page.goto(`http://127.0.0.1:5198/docs/redesign/?design=${design}`);
      await page.waitForFunction(() => window.previewReady);
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`${design} overflows at ${width}px`);
      await page.uncheck('#wrap');
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`${design} unwrapped overflows at ${width}px`);
    }
  }
  await page.setViewportSize({ width: 1280, height: 1040 });
  for (const [name, images] of [
    ['phone-layouts', [['a-phone', 'A · Workbench', 'Files and notes in sheets'], ['b-phone', 'B · Focus', 'Saved feedback stays inline'], ['phone-settings', 'Switchable layout', 'One preference, responsive presentation']]],
    ['phone-interactions', [['phone-files', 'File navigation', 'Full-width bottom sheet'], ['phone-notes', 'Saved feedback', 'Separate from unsaved drafts'], ['b-phone-editor', 'Comment editing', 'Touch-sized controls and range disclosure']]],
  ]) {
    await page.setContent(`<html><body style="margin:0;background:#101216;color:#e5e7ee;font:14px system-ui;padding:28px"><h1 style="font-size:24px;margin:0 0 8px">Code Review · Phone ${name === 'phone-layouts' ? 'layouts' : 'interactions'}</h1><p style="color:#989eaf;margin:0 0 24px">390 × 844 CSS pixels · browser-rendered prototype · not a live-host capture</p><div style="display:flex;gap:24px">${images.map(([file,title,caption])=>`<section style="flex:1;min-width:0"><h2 style="font-size:17px;margin:0 0 6px">${title}</h2><p style="font-size:12px;color:#989eaf;margin:0 0 14px">${caption}</p><img style="width:100%;border:1px solid #353943;border-radius:12px" src="http://127.0.0.1:5198/docs/redesign/screenshots/${file}.png"></section>`).join('')}</div></body></html>`);
    await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
    await page.screenshot({ path: `docs/redesign/screenshots/${name}.png`, fullPage: true });
  }
  console.log('Passed: draft survives layout switch; setting persists; no document overflow at 360/390/430px, wrapped or unwrapped.');
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser?.close();
  await server.close();
}
