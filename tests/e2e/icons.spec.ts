import type { Locator } from '@playwright/test';
import { expect, openExtensionPage, resetExtensionStorage, test, triggerCaptureSelection } from './fixtures';

async function expectDecorativeIcon(control: Locator) {
  const icon = control.locator('svg');
  await expect(icon).toHaveAttribute('aria-hidden', 'true');
  await expect(icon).toHaveAttribute('focusable', 'false');
  await expect(icon).toBeVisible();
}

async function expectKeyboardTarget(control: Locator) {
  const bounds = await control.boundingBox();
  expect(bounds!.width).toBeGreaterThanOrEqual(32);
  expect(bounds!.height).toBeGreaterThanOrEqual(32);
  await control.page().keyboard.press('Tab');
  await control.focus();
  expect(await control.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
  expect(await control.evaluate((element) => getComputedStyle(element).outlineWidth)).toBe('2px');
}

test.beforeEach(async ({ serviceWorker }) => resetExtensionStorage(serviceWorker));

test('keeps navigation names and decorative icons accessible in narrow library layouts', async ({
  context,
  extensionId,
}) => {
  const library = await openExtensionPage(context, extensionId, 'options.html');
  for (const width of [320, 640, 1280]) {
    await library.setViewportSize({ width, height: 800 });
    for (const name of ['Settings', 'Library']) {
      const button = library.getByRole('button', { name, exact: true });
      await expectDecorativeIcon(button);
      await expectKeyboardTarget(button);
      await library.keyboard.press('Enter');
      await expect(
        library.getByRole('heading', { name: name === 'Settings' ? 'Settings' : 'Saved from the web', exact: true }),
      ).toBeVisible();
    }
    const search = library.getByRole('searchbox', { name: 'Search notes, tags, or sources' });
    await expect(search).toBeVisible();
    await expectDecorativeIcon(library.locator('label').filter({ has: search }));
    expect(await library.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
  await library.evaluate(async () => {
    const api = (globalThis as unknown as { chrome: { tabs: { setZoom(factor: number): Promise<void> } } }).chrome;
    await api.tabs.setZoom(2);
  });
  await expect.poll(() => library.evaluate(() => window.innerWidth)).toBe(640);
  for (const name of ['Library', 'Settings']) {
    const button = library.getByRole('button', { name, exact: true });
    await expectDecorativeIcon(button);
    await expectKeyboardTarget(button);
  }
  expect(await library.evaluate(() => document.documentElement.scrollWidth)).toBe(640);
  await library.screenshot({ path: test.info().outputPath('icons-200-percent.png'), animations: 'disabled' });
});

test('keeps popup navigation named and the page editor close target keyboard accessible', async ({
  page,
  context,
  extensionId,
  serviceWorker,
  articleUrl,
}) => {
  const popup = await openExtensionPage(context, extensionId, 'popup.html');
  const openLibrary = popup.getByRole('button', { name: 'Open library', exact: true });
  await expectDecorativeIcon(openLibrary);
  await expectKeyboardTarget(openLibrary);
  await popup.close();

  await page.goto(articleUrl, { waitUntil: 'networkidle' });
  await page.locator('#passage').selectText();
  await triggerCaptureSelection(serviceWorker);
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await page.locator('mark.anchor-note-highlight').first().click();
  const close = page.getByRole('button', { name: 'Close', exact: true });
  await expectDecorativeIcon(close);
  await expectKeyboardTarget(close);
  await page.keyboard.press('Enter');
  await expect(page.locator('#anchor-notes-popover')).toHaveCount(0);

  const library = await openExtensionPage(context, extensionId, 'options.html');
  await library.setViewportSize({ width: 320, height: 800 });
  const source = library.getByRole('link', { name: 'Return to source', exact: true });
  await expectDecorativeIcon(source);
  await expectKeyboardTarget(source);
  for (const name of ['Edit', 'Delete']) {
    await expectKeyboardTarget(library.getByRole('button', { name, exact: true }));
  }
  await library.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(library.getByRole('dialog')).toBeVisible();
  await library.getByRole('button', { name: 'Cancel', exact: true }).click();
  const grouping = library.getByRole('button', { name: 'Group by website', exact: true });
  if ((await grouping.getAttribute('aria-pressed')) !== 'true') await grouping.click();
  const group = library.getByRole('button', { name: '127.0.0.1 1 note', exact: true });
  await expectDecorativeIcon(group);
  await group.click();
  await expect(group).toHaveAttribute('aria-expanded', 'false');
  await expect(source).toBeHidden();
  await group.click();
  await expect(source).toBeVisible();
  expect(await library.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});
