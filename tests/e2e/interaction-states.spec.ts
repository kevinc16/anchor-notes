import type { Locator } from '@playwright/test';
import { DEFAULT_SETTINGS } from '../../lib/settings';
import {
  expect,
  openExtensionPage,
  openPopupInInactiveTab,
  resetExtensionStorage,
  seedExtensionData,
  test,
  triggerCaptureSelection,
} from './fixtures';

async function computedStyle(locator: Locator, property: string): Promise<string> {
  return locator.evaluate(
    (element, styleProperty) => getComputedStyle(element).getPropertyValue(styleProperty),
    property,
  );
}

async function isFocusVisible(locator: Locator): Promise<boolean> {
  return locator.evaluate((element) => element.matches(':focus-visible'));
}

test.beforeEach(async ({ serviceWorker }) => {
  await resetExtensionStorage(serviceWorker);
});

for (const fontFamily of ['inherit', 'Verdana, sans-serif']) {
  test(`keeps library navigation within narrow viewports and keyboard accessible (${fontFamily})`, async ({
    context,
    extensionId,
  }) => {
    const library = await openExtensionPage(context, extensionId, 'options.html');
    try {
      await library.addStyleTag({ content: `aside { font-family: ${fontFamily}; }` });
      for (const width of [320, 375, 640, 760, 1024]) {
        await library.setViewportSize({ width, height: 800 });
        const libraryButton = library.getByRole('button', { name: /Library/ });
        const settingsButton = library.getByRole('button', { name: /Settings/ });

        if (width < 760) {
          const brand = await library.locator('aside > div').first().boundingBox();
          const navigation = await library.getByRole('navigation').boundingBox();
          expect(brand).not.toBeNull();
          expect(navigation).not.toBeNull();
          if (width === 320) {
            expect(navigation!.y).toBeGreaterThan(brand!.y + brand!.height);
          }
          if (width >= 640) {
            expect(navigation!.y).toBeLessThan(brand!.y + brand!.height);
          }
          // Font metrics determine whether intermediate widths fit on one row.
          if (navigation!.y > brand!.y + brand!.height) {
            expect(navigation!.x).toBe(brand!.x);
          } else {
            expect(navigation!.x).toBeGreaterThan(brand!.x + brand!.width);
            expect(navigation!.x + navigation!.width).toBeGreaterThan(width - 24);
            expect(navigation!.y + navigation!.height / 2).toBeCloseTo(brand!.y + brand!.height / 2);
          }
        }

        for (const button of [settingsButton, libraryButton]) {
          await libraryButton.focus();
          if (button === settingsButton) await library.keyboard.press('Tab');
          await expect(button).toBeFocused();
          await expect.poll(() => isFocusVisible(button)).toBe(true);
          expect(await computedStyle(button, 'outline-width')).toBe('2px');
          const bounds = await button.boundingBox();
          expect(bounds).not.toBeNull();
          expect(bounds!.x).toBeGreaterThanOrEqual(4);
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width - 4);
          await library.keyboard.press('Enter');
          await expect(
            library.getByRole('heading', {
              name: button === settingsButton ? 'Settings' : 'Saved from the web',
              exact: true,
            }),
          ).toBeVisible();
          expect(await library.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        }
      }
    } finally {
      await library.close();
    }
  });
}

test('shows hover and keyboard focus feedback in the library', async ({ context, extensionId }) => {
  const library = await openExtensionPage(context, extensionId, 'options.html');
  try {
    const settingsButton = library.getByRole('button', { name: /Settings/ });
    const initialBackground = await computedStyle(settingsButton, 'background-color');

    await settingsButton.hover();
    await expect.poll(() => computedStyle(settingsButton, 'background-color')).not.toBe(initialBackground);

    await settingsButton.focus();
    await expect.poll(() => isFocusVisible(settingsButton)).toBe(true);
    expect(await computedStyle(settingsButton, 'outline-width')).toBe('2px');

    const sortSelect = library.getByRole('combobox', { name: 'Sort notes' });
    const initialSortBackground = await computedStyle(sortSelect, 'background-color');
    await sortSelect.hover();
    await expect.poll(() => computedStyle(sortSelect, 'background-color')).not.toBe(initialSortBackground);
    await sortSelect.focus();
    await expect.poll(() => isFocusVisible(sortSelect)).toBe(true);
    expect(await computedStyle(sortSelect, 'outline-width')).toBe('2px');
  } finally {
    await library.close();
  }
});

test('shows hover and keyboard focus feedback in the popup', async ({
  page,
  context,
  serviceWorker,
  extensionId,
  articleUrl,
}) => {
  await seedExtensionData(serviceWorker, {
    schemaVersion: 1,
    notes: [],
    settings: DEFAULT_SETTINGS,
  });
  await page.goto(`${articleUrl}#popup-interaction`, { waitUntil: 'networkidle' });

  const popup = await openPopupInInactiveTab(context, extensionId, serviceWorker);
  try {
    const openLibraryButton = popup.getByRole('button', { name: 'Open library', exact: true });
    const initialBackground = await computedStyle(openLibraryButton, 'background-color');

    await openLibraryButton.hover();
    await expect.poll(() => computedStyle(openLibraryButton, 'background-color')).not.toBe(initialBackground);

    await openLibraryButton.focus();
    await expect.poll(() => isFocusVisible(openLibraryButton)).toBe(true);
    expect(await computedStyle(openLibraryButton, 'outline-width')).toBe('2px');
  } finally {
    if (!popup.isClosed()) await popup.close();
  }
});

test('shows hover and keyboard focus feedback in the page editor', async ({ page, serviceWorker, articleUrl }) => {
  await page.goto(`${articleUrl}#editor-interaction`, { waitUntil: 'networkidle' });
  await page.locator('#passage').selectText();
  await triggerCaptureSelection(serviceWorker);

  const composer = page.locator('#anchor-notes-composer');
  await expect(composer).toBeVisible();
  const saveButton = composer.getByRole('button', { name: 'Save note', exact: true });
  const initialBackground = await computedStyle(saveButton, 'background-color');

  await saveButton.hover();
  await expect.poll(() => computedStyle(saveButton, 'background-color')).not.toBe(initialBackground);

  await saveButton.focus();
  await expect.poll(() => isFocusVisible(saveButton)).toBe(true);
  expect(await computedStyle(saveButton, 'outline-width')).toBe('2px');
});

test('keeps enlarged page editor text and actions within a narrow viewport', async ({
  page,
  serviceWorker,
  articleUrl,
}) => {
  await page.setViewportSize({ width: 320, height: 500 });
  await page.goto(articleUrl, { waitUntil: 'networkidle' });
  await page.locator('#passage').selectText();
  await triggerCaptureSelection(serviceWorker);
  const composer = page.locator('#anchor-notes-composer');
  await expect(composer).toBeVisible();
  const bounds = await composer.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(500);
  expect(await computedStyle(composer.locator('textarea'), 'font-size')).toBe('14px');
  expect(await computedStyle(composer.locator('.anchor-composer-quote'), 'font-size')).toBe('18px');
  await composer.locator('textarea').fill('A readable personal note.');
  await composer.getByRole('button', { name: 'Save note', exact: true }).click();
  await page.locator('mark.anchor-note-highlight').first().click();
  const popover = page.locator('#anchor-notes-popover');
  await expect(popover).toBeVisible();
  expect(await popover.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const save = popover.getByRole('button', { name: 'Save changes', exact: true });
  for (const width of [320, 375, 640]) {
    await page.setViewportSize({ width, height: 500 });
    const library = await popover.getByRole('button', { name: 'Open library', exact: true }).boundingBox();
    const remove = await popover.getByRole('button', { name: 'Remove highlight', exact: true }).boundingBox();
    const primary = await save.boundingBox();
    expect(library!.y + library!.height).toBeLessThanOrEqual(remove!.y);
    expect(remove!.y + remove!.height / 2).toBeCloseTo(primary!.y + primary!.height / 2, 0);
    expect(remove!.x).toBeCloseTo(library!.x, 0);
    const removeTextX = await popover.locator('.anchor-remove').evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getBoundingClientRect().x;
    });
    expect(removeTextX).toBeCloseTo(library!.x, 0);
    const actions = await popover.locator('.anchor-composer-actions').boundingBox();
    expect(primary!.x + primary!.width).toBeCloseTo(actions!.x + actions!.width, 0);
    await popover.screenshot({ path: test.info().outputPath(`editor-footer-${width}.png`) });
  }
  const removeAction = popover.getByRole('button', { name: 'Remove highlight', exact: true });
  await removeAction.hover();
  expect(await computedStyle(removeAction, 'background-color')).toBe('rgba(0, 0, 0, 0)');
  expect(await computedStyle(removeAction, 'text-decoration-line')).toBe('underline');
  await save.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(save).toBeFocused();
  await expect.poll(() => isFocusVisible(save)).toBe(true);
  await save.press('Enter');
  await expect(popover).toHaveCount(0);
});
