import { DEFAULT_SETTINGS } from '../../lib/settings';
import {
  test,
  expect,
  resetExtensionStorage,
  seedExtensionData,
  openExtensionPage,
  readExtensionData,
  triggerCaptureSelection,
} from './fixtures';

test.beforeEach(async ({ serviceWorker }) => resetExtensionStorage(serviceWorker));

test('switches open surfaces live, preserves composer drafts, and persists the override', async ({
  context,
  page,
  serviceWorker,
  extensionId,
  articleUrl,
}) => {
  await seedExtensionData(serviceWorker, { schemaVersion: 1, notes: [], settings: DEFAULT_SETTINGS });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(articleUrl);
  await page.bringToFront();
  await page.locator('#passage').selectText();
  await triggerCaptureSelection(serviceWorker);
  const composer = page.locator('#anchor-notes-composer');
  await expect(composer).toBeVisible();
  await composer.locator('textarea').fill('Keep this draft');
  const hostBefore = await page
    .locator('body')
    .evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }));
  const options = await openExtensionPage(context, extensionId, 'options.html');
  const popup = await openExtensionPage(context, extensionId, 'popup.html');
  const library = await openExtensionPage(context, extensionId, 'options.html');
  await options.getByRole('button', { name: /Settings/ }).click();
  await expect(options.getByLabel('Theme', { exact: true })).toHaveValue('system');
  const lightSurface = await composer.evaluate((el) => getComputedStyle(el).backgroundColor);
  await options.getByLabel('Theme', { exact: true }).selectOption('dark');
  for (const surface of [options, popup, library]) {
    await expect(surface.locator('html')).toHaveAttribute('data-anchor-theme', 'dark');
    await expect
      .poll(() => surface.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe('rgb(29, 28, 25)');
  }
  await expect(composer).toHaveAttribute('data-anchor-theme', 'dark');
  expect(await composer.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(lightSurface);
  await expect(composer.locator('textarea')).toHaveValue('Keep this draft');
  expect(
    await page
      .locator('body')
      .evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color })),
  ).toEqual(hostBefore);
  await expect(page.locator('html')).not.toHaveAttribute('data-anchor-theme');
  expect((await readExtensionData(serviceWorker)).settings.theme).toBe('dark');
  await options.reload();
  await expect(options.locator('html')).toHaveAttribute('data-anchor-theme', 'dark');
  await options.getByRole('button', { name: /Settings/ }).click();
  await expect(options.getByLabel('Theme', { exact: true })).toHaveValue('dark');
  await options.emulateMedia({ colorScheme: 'light' });
  await expect(options.locator('html')).toHaveAttribute('data-anchor-theme', 'dark');
  await options.getByLabel('Theme', { exact: true }).selectOption('light');
  await expect(composer).toHaveAttribute('data-anchor-theme', 'light');
  await options.getByLabel('Theme', { exact: true }).selectOption('system');
  await options.emulateMedia({ colorScheme: 'dark' });
  await expect(options.locator('html')).toHaveAttribute('data-anchor-theme', 'dark');
  await options.emulateMedia({ colorScheme: 'light' });
  await expect(options.locator('html')).toHaveAttribute('data-anchor-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(composer).toHaveAttribute('data-anchor-theme', 'dark');
});

test('old installations default to System and follow the OS', async ({ context, extensionId }) => {
  const options = await openExtensionPage(context, extensionId, 'options.html');
  await options.emulateMedia({ colorScheme: 'dark' });
  await expect(options.locator('html')).toHaveAttribute('data-anchor-theme', 'dark');
  await options.getByRole('button', { name: /Settings/ }).click();
  await expect(options.getByLabel('Theme', { exact: true })).toHaveValue('system');
  await options.emulateMedia({ colorScheme: 'light' });
  await expect(options.locator('html')).toHaveAttribute('data-anchor-theme', 'light');
});

// Contrast is checked against rendered colors, independent of theme token names.
function luminance(rgb: number[]) {
  const linear = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
}
function contrast(foreground: number[], background: number[]) {
  const a = luminance(foreground),
    b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
async function expectReadable(locator: import('@playwright/test').Locator) {
  // Theme changes can leave controls in their 150ms color transition briefly.
  await expect
    .poll(async () => {
      const colors = await locator.evaluate((el) => {
        const style = getComputedStyle(el);
        let background = style.backgroundColor;
        let parent = el.parentElement;
        while (background === 'rgba(0, 0, 0, 0)' && parent) {
          background = getComputedStyle(parent).backgroundColor;
          parent = parent.parentElement;
        }
        return { foreground: style.color, background };
      });
      const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      return contrast(rgb(colors.foreground), rgb(colors.background));
    })
    .toBeGreaterThanOrEqual(4.5);
}

test('themes saved-note editors, delete dialogs, fields, buttons and toasts in both palettes', async ({
  context,
  page,
  serviceWorker,
  extensionId,
  articleUrl,
}) => {
  await seedExtensionData(serviceWorker, { schemaVersion: 1, notes: [], settings: DEFAULT_SETTINGS });
  await page.goto(articleUrl);
  await page.bringToFront();
  await page.locator('#passage').selectText();
  await triggerCaptureSelection(serviceWorker);
  await page.locator('#anchor-notes-composer textarea').fill('A saved note');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.locator('#anchor-notes-toast')).toHaveText('Highlight anchored');
  const options = await openExtensionPage(context, extensionId, 'options.html');
  const library = await openExtensionPage(context, extensionId, 'options.html');
  await options.getByRole('button', { name: /Settings/ }).click();
  for (const theme of ['dark', 'light'] as const) {
    await options.getByLabel('Theme', { exact: true }).selectOption(theme);
    await expect(options.locator('html')).toHaveAttribute('data-anchor-theme', theme);
    await expectReadable(options.getByText('Anchor', { exact: true }));
    await expectReadable(options.getByLabel('Theme', { exact: true }));
    await expectReadable(options.getByRole('button', { name: 'Enable LLM', exact: true }));
    await page.locator('mark.anchor-note-highlight').first().click();
    const editor = page.locator('#anchor-notes-popover');
    await expect(editor).toHaveAttribute('data-anchor-theme', theme);
    await editor.getByLabel('Current note').fill('Preserve this edit');
    await expectReadable(editor.getByLabel('Current note'));
    await expectReadable(editor.getByRole('button', { name: 'Save changes' }));
    const save = editor.getByRole('button', { name: 'Save changes' });
    await save.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(save).toBeFocused();
    expect(await save.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
    await editor.getByRole('button', { name: 'Delete', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expectReadable(dialog);
    await expectReadable(dialog.getByRole('button', { name: 'Delete', exact: true }));
    // Changing a theme while a native modal is open updates its inherited palette.
    const before = await dialog.evaluate((el) => getComputedStyle(el).backgroundColor);
    await options.getByLabel('Theme', { exact: true }).selectOption(theme === 'dark' ? 'light' : 'dark');
    await expect.poll(() => dialog.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(before);
    await expect(editor.getByLabel('Current note')).toHaveValue('Preserve this edit');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await options.getByLabel('Theme', { exact: true }).selectOption(theme);
    await save.click();
    await expect(page.locator('#anchor-notes-toast')).toHaveAttribute('data-anchor-theme', theme);
    await expectReadable(page.locator('#anchor-notes-toast'));
    await library.locator('article').getByRole('button', { name: 'Edit', exact: true }).click();
    await expectReadable(library.getByRole('dialog').getByRole('textbox', { name: /^Your note/ }));
    await library.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await library.locator('article').getByRole('button', { name: 'Delete', exact: true }).click();
    await expectReadable(library.getByRole('dialog'));
    await library.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  }
});

test('all four highlight colors retain contrast on light and dark host pages', async ({
  page,
  serviceWorker,
  articleUrl,
}) => {
  await seedExtensionData(serviceWorker, {
    schemaVersion: 1,
    notes: [],
    settings: { ...DEFAULT_SETTINGS, highlightCoverage: 'full' },
  });
  await page.goto(articleUrl);
  await page.bringToFront();
  await page.locator('#passage').selectText();
  await triggerCaptureSelection(serviceWorker);
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  const mark = page.locator('mark.anchor-note-highlight').first();
  await expect(mark).toBeVisible();
  for (const darkHost of [false, true]) {
    const background = darkHost ? [51, 51, 51] : [255, 255, 255];
    const foreground = darkHost ? [170, 170, 170] : [36, 33, 29];
    await page.locator('body').evaluate(
      (el, { darkHost }) => {
        el.style.backgroundColor = darkHost ? 'rgb(51,51,51)' : 'white';
        el.style.color = darkHost ? 'rgb(170,170,170)' : 'rgb(36,33,29)';
      },
      { darkHost },
    );
    for (const color of ['yellow', 'mint', 'lilac', 'coral']) {
      await mark.click();
      await page.getByRole('button', { name: `Use ${color} highlight`, exact: true }).click();
      const styles = await mark.evaluate((el) => ({
        color: getComputedStyle(el).color,
        background: getComputedStyle(el).backgroundImage,
      }));
      expect((styles.color.match(/[\d.]+/g) ?? []).map(Number)).toEqual(foreground);
      const match = [...styles.background.matchAll(/rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/g)].at(-1);
      expect(match).not.toBeNull();
      const alpha = Number(match![4]);
      const blended = [1, 2, 3].map((channel, i) => Number(match![channel]) * alpha + background[i]! * (1 - alpha));
      expect(contrast(foreground, blended), `${color} on ${darkHost ? 'dark' : 'light'} host`).toBeGreaterThanOrEqual(
        4.5,
      );
      await page.getByRole('button', { name: 'Close', exact: true }).click();
    }
  }
  await expect(page.locator('html')).not.toHaveAttribute('data-anchor-theme');
});

test('exports the theme preference and tolerates legacy backups without it', async ({
  context,
  serviceWorker,
  extensionId,
}) => {
  const { readFile } = await import('node:fs/promises');
  await seedExtensionData(serviceWorker, {
    schemaVersion: 1,
    notes: [],
    settings: { ...DEFAULT_SETTINGS, theme: 'dark' },
  });
  const options = await openExtensionPage(context, extensionId, 'options.html');
  const [download] = await Promise.all([
    options.waitForEvent('download'),
    options.getByRole('button', { name: 'Export backup', exact: true }).click(),
  ]);
  const backup = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(backup.settings.theme).toBe('dark');
  // Legacy data in storage follows the OS after normalization. Importing settings is #132.
  delete backup.settings.theme;
  await seedExtensionData(serviceWorker, backup);
  await options.emulateMedia({ colorScheme: 'light' });
  await expect(options.locator('html')).toHaveAttribute('data-anchor-theme', 'light');
  await options.getByRole('button', { name: /Settings/ }).click();
  await expect(options.getByLabel('Theme', { exact: true })).toHaveValue('system');
});

test('a delayed startup read cannot undo a newer theme preference', async ({ context, extensionId, serviceWorker }) => {
  await seedExtensionData(serviceWorker, { schemaVersion: 1, notes: [], settings: DEFAULT_SETTINGS });
  const options = await context.newPage();
  await options.addInitScript(() => {
    // Delay the independent session-key read, leaving the initial settings snapshot pending.
    const api = (
      globalThis as unknown as { chrome: { storage: { session: { get: (...args: unknown[]) => Promise<unknown> } } } }
    ).chrome;
    const original = api.storage.session.get.bind(api.storage.session);
    api.storage.session.get = async (...args: unknown[]) => {
      const snapshot = await original(...args);
      await new Promise<void>((resolve) => {
        (globalThis as unknown as { finishStartup: () => void }).finishStartup = resolve;
      });
      return snapshot;
    };
  });
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.waitForFunction(
    () => typeof (globalThis as unknown as { finishStartup?: unknown }).finishStartup === 'function',
  );
  await seedExtensionData(serviceWorker, {
    schemaVersion: 1,
    notes: [],
    settings: { ...DEFAULT_SETTINGS, theme: 'dark' },
  });
  await expect(options.locator('html')).toHaveAttribute('data-anchor-theme', 'dark');
  await options.getByRole('button', { name: /Settings/ }).click();
  await expect(options.getByLabel('Theme', { exact: true })).toHaveValue('dark');
  await options.evaluate(() => (globalThis as unknown as { finishStartup: () => void }).finishStartup());
  // Saving after hydration must not write the stale startup theme back to storage.
  await options.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect.poll(async () => (await readExtensionData(serviceWorker)).settings.theme).toBe('dark');
  await expect(options.getByLabel('Theme', { exact: true })).toHaveValue('dark');
});

test('keeps the explicit preference across browser restarts', async ({ context: _context }, testInfo) => {
  const { chromium } = await import('@playwright/test');
  const path = await import('node:path');
  const extension = path.resolve('.output/chrome-mv3');
  const profile = testInfo.outputPath('persistent-profile');
  const launch = () =>
    chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      colorScheme: 'light',
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
  let browser = await launch();
  try {
    let worker = browser.serviceWorkers()[0] ?? (await browser.waitForEvent('serviceworker'));
    let options = await openExtensionPage(browser, new URL(worker.url()).hostname, 'options.html');
    await options.getByRole('button', { name: /Settings/ }).click();
    await options.getByLabel('Theme', { exact: true }).selectOption('dark');
    await expect(options.locator('html')).toHaveAttribute('data-anchor-theme', 'dark');
    await browser.close();
    browser = await launch();
    worker = browser.serviceWorkers()[0] ?? (await browser.waitForEvent('serviceworker'));
    options = await openExtensionPage(browser, new URL(worker.url()).hostname, 'options.html');
    await expect(options.locator('html')).toHaveAttribute('data-anchor-theme', 'dark');
    await options.getByRole('button', { name: /Settings/ }).click();
    await expect(options.getByLabel('Theme', { exact: true })).toHaveValue('dark');
  } finally {
    await browser.close();
  }
});
