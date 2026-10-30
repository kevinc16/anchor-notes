import { DEFAULT_SETTINGS } from '../../lib/settings';
import { LOCKED_API_KEY_WARNING } from '../../lib/credential-settings';
import { encryptSecret } from '../../lib/secrets';
import type { Page, Worker } from '@playwright/test';
import type { AnchorData, AnchorSettings } from '../../lib/types';
import {
  expect,
  openExtensionPage,
  openPopupInInactiveTab,
  readExtensionData,
  readSessionApiKey,
  resetExtensionStorage,
  seedExtensionData,
  test,
  triggerCaptureSelection,
} from './fixtures';

const API_KEY = 'e2e-test-api-key';
const PASSPHRASE = 'correct horse battery';

function customEndpoint(articleUrl: string): string {
  return new URL('/v1/chat/completions', articleUrl).href;
}

async function saveFixtureHighlight(page: Page, serviceWorker: Worker, articleUrl: string, body: string) {
  await page.goto(`${articleUrl}#settings-e2e`, { waitUntil: 'networkidle' });
  await page.bringToFront();
  await page.locator('#passage').selectText();
  await triggerCaptureSelection(serviceWorker);

  const composer = page.locator('#anchor-notes-composer');
  await expect(composer).toBeVisible();
  await composer.locator('textarea').fill(body);
  await composer.getByRole('button', { name: 'Save note' }).click();
  await expect(page.locator('#anchor-notes-toast')).toBeVisible();
}

test.beforeEach(async ({ serviceWorker }) => {
  await resetExtensionStorage(serviceWorker);
});

test('saves global highlight defaults and organizes a new note with a custom provider', async ({
  page,
  context,
  serviceWorker,
  extensionId,
  articleUrl,
}) => {
  const endpoint = customEndpoint(articleUrl);
  await seedExtensionData(serviceWorker, {
    schemaVersion: 1,
    notes: [],
    settings: DEFAULT_SETTINGS,
  });

  const settingsPage = await openExtensionPage(context, extensionId, 'options.html');
  try {
    await settingsPage.getByRole('button', { name: /Settings/ }).click();
    await expect(settingsPage.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await settingsPage.getByRole('button', { name: 'Coral', exact: true }).click();
    await settingsPage.getByRole('button', { name: /Entire 100% element/ }).click();
    await settingsPage.getByRole('button', { name: 'Enable LLM', exact: true }).click();
    await expect(settingsPage.getByLabel('LLM provider')).toBeVisible();
    await settingsPage.getByLabel('LLM provider').selectOption('custom');
    await settingsPage.getByLabel('API endpoint').fill(endpoint);
    await settingsPage.getByRole('textbox', { name: 'Model', exact: true }).fill('e2e-model');
    await settingsPage.getByRole('textbox', { name: /API key/ }).fill(API_KEY);
    await settingsPage.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(settingsPage.getByText('Settings saved', { exact: true })).toBeVisible();
  } finally {
    await settingsPage.close();
  }

  const savedSettings = (await readExtensionData(serviceWorker)).settings;
  expect(savedSettings).toMatchObject({
    highlightColor: 'coral',
    highlightCoverage: 'full',
    aiEnabled: true,
    aiProvider: 'custom',
    aiEndpoint: endpoint,
    aiModel: 'e2e-model',
    aiApiKey: API_KEY,
  });

  await saveFixtureHighlight(
    page,
    serviceWorker,
    articleUrl,
    'Use the local provider to organize this API architecture note.',
  );
  await expect(page.locator('#anchor-notes-toast')).toHaveText('Highlight anchored');

  await expect
    .poll(async () => (await readExtensionData(serviceWorker)).notes[0])
    .toMatchObject({
      body: 'Use the local provider to organize this API architecture note.',
      tags: ['e2e', 'ai'],
      summary: 'Organized by the local E2E provider.',
    });
});

test('encrypts, unlocks, and disables encryption for an API key', async ({
  context,
  serviceWorker,
  extensionId,
  articleUrl,
}) => {
  const initialSettings: AnchorSettings = {
    ...DEFAULT_SETTINGS,
    aiEnabled: true,
    aiProvider: 'custom',
    aiEndpoint: customEndpoint(articleUrl),
    aiModel: 'e2e-model',
    aiApiKey: API_KEY,
  };
  await seedExtensionData(serviceWorker, {
    schemaVersion: 1,
    notes: [],
    settings: initialSettings,
  });

  const settingsPage = await openExtensionPage(context, extensionId, 'options.html');
  try {
    await settingsPage.getByRole('button', { name: /Settings/ }).click();
    await expect(settingsPage.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(settingsPage.getByLabel('Encryption passphrase')).toHaveCount(0);

    await settingsPage.getByRole('checkbox', { name: /Encrypt this API key/ }).check();
    await expect(settingsPage.getByLabel('Encryption passphrase')).toBeVisible();
    await settingsPage.getByLabel('Encryption passphrase').fill(PASSPHRASE);
    await settingsPage.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(settingsPage.getByText('Encrypted settings saved', { exact: true })).toBeVisible();
    await expect(settingsPage.getByLabel('Encryption passphrase')).toHaveCount(0);

    const encryptedData = await readExtensionData(serviceWorker);
    expect(encryptedData.settings.aiApiKey).toBe('');
    expect(encryptedData.settings.aiApiKeyEncrypted).toBeDefined();
    expect(JSON.stringify(encryptedData.settings)).not.toContain(API_KEY);
    expect(await readSessionApiKey(serviceWorker)).toBe(API_KEY);

    await settingsPage.close();
    await seedExtensionData(serviceWorker, encryptedData);

    const lockedPage = await openExtensionPage(context, extensionId, 'options.html');
    try {
      await lockedPage.getByRole('button', { name: /Settings/ }).click();
      await expect(lockedPage.getByRole('heading', { name: 'Settings' })).toBeVisible();
      await expect(lockedPage.getByLabel('Encryption passphrase')).toBeVisible();
      await expect(lockedPage.getByRole('button', { name: 'Unlock key', exact: true })).toBeVisible();

      await lockedPage.getByLabel('Encryption passphrase').fill('wrong passphrase');
      const wrongPassphraseDialog = lockedPage.waitForEvent('dialog');
      await lockedPage.getByRole('button', { name: 'Unlock key', exact: true }).click();
      const dialog = await wrongPassphraseDialog;
      expect(dialog.message()).toContain('Could not unlock the API key');
      await dialog.dismiss();

      await lockedPage.getByLabel('Encryption passphrase').fill(PASSPHRASE);
      await lockedPage.getByRole('button', { name: 'Unlock key', exact: true }).click();
      await expect(lockedPage.getByText('API key unlocked for this browser session', { exact: true })).toBeVisible();
      await expect(lockedPage.getByLabel('Encryption passphrase')).toHaveCount(0);
      expect(await readSessionApiKey(serviceWorker)).toBe(API_KEY);

      await lockedPage.getByRole('checkbox', { name: /Encrypt this API key/ }).uncheck();
      await expect(lockedPage.getByLabel('Encryption passphrase')).toBeVisible();
      await lockedPage.getByLabel('Encryption passphrase').fill(PASSPHRASE);
      await lockedPage.getByRole('button', { name: 'Save settings', exact: true }).click();
      await expect(lockedPage.getByText('Settings saved', { exact: true })).toBeVisible();
      await expect(lockedPage.getByLabel('Encryption passphrase')).toHaveCount(0);
    } finally {
      await lockedPage.close();
    }
  } catch (error) {
    if (!settingsPage.isClosed()) await settingsPage.close();
    throw error;
  }

  const plaintextData = await readExtensionData(serviceWorker);
  expect(plaintextData.settings.aiApiKey).toBe(API_KEY);
  expect(plaintextData.settings.aiApiKeyEncrypted).toBeUndefined();
  expect(await readSessionApiKey(serviceWorker)).toBe('');
});

test('warns when a new highlight cannot use a locked encrypted API key', async ({
  page,
  context,
  extensionId,
  serviceWorker,
  articleUrl,
}) => {
  const encrypted = await encryptSecret(API_KEY, PASSPHRASE);
  const settings: AnchorSettings = {
    ...DEFAULT_SETTINGS,
    aiEnabled: true,
    aiProvider: 'custom',
    aiEndpoint: customEndpoint(articleUrl),
    aiModel: 'e2e-model',
    aiApiKey: '',
    aiApiKeyEncrypted: encrypted,
  };
  const data: AnchorData = { schemaVersion: 1, notes: [], settings };
  await seedExtensionData(serviceWorker, data);

  await saveFixtureHighlight(page, serviceWorker, articleUrl, 'Save this while the encrypted provider key is locked.');
  await expect(page.locator('#anchor-notes-toast')).toHaveText(LOCKED_API_KEY_WARNING);

  const savedData = await readExtensionData(serviceWorker);
  expect(savedData.notes).toHaveLength(1);
  expect(savedData.notes[0]).toMatchObject({
    body: 'Save this while the encrypted provider key is locked.',
  });
  expect(savedData.notes[0]?.summary).toBeUndefined();
  expect(await readSessionApiKey(serviceWorker)).toBe('');
  const library = await openExtensionPage(context, extensionId, 'options.html');
  await expect(library.locator('article')).toHaveCount(1);
  await expect(library.getByText('Generating summary…')).toHaveCount(0);
  await expect(library.getByText('Summary unavailable. Your note is saved.')).toHaveCount(0);
});

test('restores backup settings into open forms and webpages without organizing imported notes', async ({
  page,
  context,
  serviceWorker,
  extensionId,
  articleUrl,
}) => {
  await seedExtensionData(
    serviceWorker,
    { schemaVersion: 1, notes: [], settings: DEFAULT_SETTINGS },
    'synthetic-stale-session',
  );
  await saveFixtureHighlight(page, serviceWorker, articleUrl, 'Synthetic backup note');
  const original = await readExtensionData(serviceWorker);
  const popup = await openPopupInInactiveTab(context, extensionId, serviceWorker);
  await expect(popup.getByText('Synthetic backup note', { exact: true })).toBeVisible();
  const settingsPage = await openExtensionPage(context, extensionId, 'options.html');
  const otherSettings = await openExtensionPage(context, extensionId, 'options.html');
  for (const surface of [settingsPage, otherSettings]) {
    await surface.getByRole('button', { name: /Settings/ }).click();
    await expect(
      surface.getByRole('group', { name: 'Highlight color', exact: true }).getByRole('button').first(),
    ).toHaveAttribute('aria-pressed', 'true');
  }
  let providerRequests = 0;
  context.on('request', (request) => {
    if (request.url().includes('/v1/chat/completions')) providerRequests++;
  });
  const encrypted = await encryptSecret(API_KEY, PASSPHRASE);
  const backup = {
    ...original,
    notes: original.notes.map((note) => ({ ...note, body: 'Restored synthetic note' })),
    settings: {
      ...DEFAULT_SETTINGS,
      theme: 'dark',
      highlightColor: 'coral',
      highlightCoverage: 'full',
      aiEnabled: true,
      aiProvider: 'custom',
      aiEndpoint: customEndpoint(articleUrl),
      aiModel: 'restored-model',
      aiApiKeyEncrypted: encrypted,
    },
  };
  await settingsPage
    .locator('input[type=file]')
    .setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(settingsPage.getByText('Backup imported', { exact: true })).toBeVisible();
  for (const surface of [settingsPage, otherSettings]) {
    await expect(surface.getByRole('button', { name: 'Coral', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(surface.getByRole('button', { name: /Entire 100% element/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(surface.getByRole('textbox', { name: 'Model', exact: true })).toHaveValue('restored-model');
    await expect(surface.getByRole('button', { name: 'Unlock key', exact: true })).toBeVisible();
  }
  for (const surface of [settingsPage, otherSettings, popup]) {
    await expect(surface.locator('html')).toHaveAttribute('data-anchor-theme', 'dark');
  }
  await expect(otherSettings.getByLabel('Theme', { exact: true })).toHaveValue('dark');
  expect(await readSessionApiKey(serviceWorker)).toBe('');
  expect((await readExtensionData(serviceWorker)).notes).toEqual(backup.notes);
  await expect(popup.getByText('Restored synthetic note', { exact: true })).toBeVisible();
  await expect(page.locator('mark.anchor-note-highlight').first()).toHaveAttribute('data-anchor-coverage', 'full');
  expect(providerRequests).toBe(0);
  // Even an identical backup must replace unsaved drafts in another open Settings form.
  await otherSettings.getByRole('button', { name: 'Mint', exact: true }).click();
  await otherSettings.getByRole('textbox', { name: 'Model', exact: true }).fill('unsaved-model');
  await otherSettings.getByLabel('Encryption passphrase').fill('synthetic unsaved passphrase');
  await settingsPage.locator('input[type=file]').setInputFiles({
    name: 'same-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(otherSettings.getByRole('button', { name: 'Coral', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(otherSettings.getByRole('textbox', { name: 'Model', exact: true })).toHaveValue('restored-model');
  await expect(otherSettings.getByLabel('Encryption passphrase')).toHaveValue('');
  const downloadEvent = settingsPage.waitForEvent('download');
  await settingsPage.getByRole('button', { name: 'Export JSON', exact: true }).click();
  const download = await downloadEvent;
  const { readFile } = await import('node:fs/promises');
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(exported.settings).toEqual(backup.settings);
  expect(JSON.stringify(exported)).not.toContain('synthetic-stale-session');
  expect(JSON.stringify(exported)).not.toContain(PASSPHRASE);
  await settingsPage.locator('input[type=file]').setInputFiles({
    name: 'legacy.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ notes: [] })),
  });
  await expect.poll(async () => (await readExtensionData(serviceWorker)).settings).toEqual(backup.settings);
  expect(providerRequests).toBe(0);
  // The actual downloaded backup remains importable after preferences change.
  await settingsPage.locator('input[type=file]').setInputFiles({
    name: 'partial.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ notes: [], settings: {} })),
  });
  await expect(settingsPage.getByRole('button', { name: 'Enable LLM', exact: true })).toBeVisible();
  await settingsPage.locator('input[type=file]').setInputFiles({
    name: 'roundtrip.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(settingsPage.getByRole('button', { name: 'Unlock key', exact: true })).toBeVisible();
  expect((await readExtensionData(serviceWorker)).settings).toEqual(backup.settings);
  expect(providerRequests).toBe(0);
});
