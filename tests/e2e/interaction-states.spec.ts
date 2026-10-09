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
