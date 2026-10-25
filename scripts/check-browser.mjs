// npm run build && node scripts/check-browser.mjs /absolute/path/to/playwright/index.mjs
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const server = await createServer({ configFile: false, root: process.cwd(), server: { host: '127.0.0.1', port: 5199, strictPort: true } });
await server.listen();
let browser;
const dir = 'docs/screenshots/0.2.0';
try {
  await mkdir(dir, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5199/scripts/browser/');
  await page.waitForFunction(() => window.fixture?.panel?.shadowRoot);
  await page.locator('[data-source="git-unstaged"]').click();
  await page.locator('.file-nav button[title="src/browser/chips.ts"]').click();
  await page.getByRole('button', { name: 'Current line 88', exact: true }).click();
  await page.locator('.editor textarea').fill('Keep this guard after the async read so switching conversations cannot attach feedback to the wrong session.');
  await page.getByRole('button', { name: 'Save comment', exact: true }).click();
  await page.waitForFunction(() => window.fixture.panel.shadowRoot.querySelector('article'));
  await page.getByRole('button', { name: 'Current line 93', exact: true }).click();
  const draft = 'Can we add a test for switching sessions while setChip is pending?';
  await page.locator('.editor textarea').fill(draft);
  const changeLayout = async layout => {
    await page.getByRole('button', { name: 'Review settings', exact: true }).click();
    await page.locator(`input[name="layout"][value="${layout}"]`).check();
    await page.getByRole('button', { name: 'Apply layout', exact: true }).click();
    await page.waitForFunction(layout => window.fixture.panel.shadowRoot.querySelector(`.review-panel.${layout}`), layout);
    assert.equal(await page.locator('.editor textarea').inputValue(), draft);
  };
  for (const layout of ['workbench', 'focus']) {
    await changeLayout(layout);
    await page.screenshot({ path: `${dir}/${layout}-desktop.png`, fullPage: true });
    await page.evaluate(() => document.body.classList.add('light'));
    await page.screenshot({ path: `${dir}/${layout}-light.png`, fullPage: true });
    await page.evaluate(() => document.body.classList.remove('light'));
  }
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const layout of ['workbench', 'focus']) {
      await changeLayout(layout);
      const wrap = page.locator('.wrap-control input');
      for (const wrapped of [true, false]) {
        await wrap.setChecked(wrapped);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${layout} overflow at ${width}px, wrap=${wrapped}`);
      }
      await wrap.check();
      if (width === 390) {
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: `${dir}/${layout}-phone.png`, fullPage: true });
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.file-switch').click();
  assert.equal(await page.locator('dialog').evaluate(el => el.open), true);
  await page.screenshot({ path: `${dir}/phone-files.png` });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog').evaluate(el => el.open), false);
  await page.locator('.mobile-notes').click();
  assert.match(await page.locator('dialog').textContent(), /Keep this guard/);
  await page.screenshot({ path: `${dir}/phone-notes.png` });
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Review settings', exact: true }).click();
  await page.screenshot({ path: `${dir}/phone-settings.png` });
  // Native modal focus must remain within the dialog when tabbing.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => {
      const root = window.fixture.panel.shadowRoot;
      // Chromium can move focus to browser chrome at the end of a native dialog.
      return document.activeElement === document.body || root.querySelector('dialog').contains(root.activeElement);
    }), true, 'Focus reached inert page content');
  }
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.editor textarea').inputValue(), draft);
  await page.locator('.editor .range summary').click();
  await page.locator('.editor input[type="number"]').last().fill('94');
  await page.locator('.editor input[type="number"]').last().dispatchEvent('input');
  assert.equal(await page.getByRole('button', { name: 'Save comment', exact: true }).isEnabled(), true);
  await page.locator('.editor').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${dir}/phone-editor.png` });
  await page.getByRole('button', { name: 'Attach review to composer', exact: true }).click();
  await page.waitForFunction(() => window.fixture.attachedChip !== undefined);
  assert.equal(await page.evaluate(() => window.fixture.attachedChip.label), "Review (1)");
  assert.equal(await page.evaluate(draft => window.fixture.attachedChip.text.includes(draft), draft), false, "Unsaved draft leaked into attached review");
  assert.equal(await page.locator('.editor textarea').inputValue(), draft, 'Attaching must not clear draft');
  assert.equal(await page.evaluate(() => window.fixture.styleRoots), 1);
  // Keep a draft while switching sources; old coordinates must not become saveable.
  await page.locator('[data-source="git-compare"]').click();
  await page.locator('form[aria-label="Compare revisions"]').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Compare controls overflow');
  assert.equal(await page.getByRole('button', { name: 'Save comment', exact: true }).isDisabled(), true);
  await page.screenshot({ path: `${dir}/phone-compare.png`, fullPage: true });
  await page.evaluate(() => window.fixture.dispose());
  assert.equal(await page.evaluate(() => window.fixture.styleRoots), 0);
  assert.deepEqual(errors, []);
  console.log('Production browser checks passed: dark/light desktop; 360/390/430px phones; wrapping; preserved draft; sheets; modal keyboard containment; range editing; attach; stale draft; style lifecycle.');
} finally {
  await browser?.close();
  await server.close();
}
