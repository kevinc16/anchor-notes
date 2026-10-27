import { DEFAULT_SETTINGS } from '../../lib/settings';
import type { Page, Worker } from '@playwright/test';
import {
  expect,
  openExtensionPage,
  readExtensionData,
  resetExtensionStorage,
  seedExtensionData,
  test,
  triggerCaptureSelection,
} from './fixtures';

async function startGeneration(page: Page, serviceWorker: Worker, articleUrl: string, selector = '#passage') {
  await page.goto(articleUrl);
  await page.bringToFront();
  await page.locator(selector).selectText();
  await triggerCaptureSelection(serviceWorker);
  await page.locator('#anchor-notes-composer').getByRole('button', { name: 'Save note' }).click();
}

async function release(articleUrl: string, result = 'success') {
  const url = new URL('/release-completion', articleUrl);
  url.searchParams.set('hold', 'summary');
  url.searchParams.set('result', result);
  // The session status is written before the HTTP request reaches the fixture server.
  await expect.poll(async () => (await fetch(url)).status).toBe(200);
}

test.beforeEach(async ({ serviceWorker, articleUrl }) => {
  await resetExtensionStorage(serviceWorker);
  await seedExtensionData(serviceWorker, {
    schemaVersion: 1,
    notes: [],
    settings: {
      ...DEFAULT_SETTINGS,
      aiEnabled: true,
      aiProvider: 'custom',
      aiEndpoint: new URL('/v1/chat/completions?hold=summary', articleUrl).href,
      aiModel: 'e2e-model',
    },
  });
});

test('shows live summary progress in an open library and after reopening it', async ({
  page,
  context,
  serviceWorker,
  extensionId,
  articleUrl,
}) => {
  let library = await openExtensionPage(context, extensionId, 'options.html');
  await startGeneration(page, serviceWorker, articleUrl);
  await expect(library.locator('article').getByRole('status')).toHaveText('Generating summary…');
  await library.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await library
      .locator('article')
      .getByRole('status')
      .locator('[aria-hidden="true"]')
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none');
  await expect(library.getByRole('button', { name: 'Edit', exact: true })).toBeEnabled();
  await library.close();
  library = await openExtensionPage(context, extensionId, 'options.html');
  await expect(library.locator('article').getByRole('status')).toHaveText('Generating summary…');
  await release(articleUrl);
  await expect(library.getByText('Organized by the local E2E provider.', { exact: true })).toBeVisible();
  await expect(library.getByText('Generating summary…')).toHaveCount(0);
  await expect(library.locator('article').getByText('ai', { exact: true })).toBeVisible();
  expect((await readExtensionData(serviceWorker)).notes[0]).not.toHaveProperty('generationStatus');
});

test('tracks concurrent notes independently in the ungrouped library', async ({
  page,
  context,
  serviceWorker,
  extensionId,
  articleUrl,
}) => {
  const library = await openExtensionPage(context, extensionId, 'options.html');
  await library.getByRole('button', { name: 'Group by website', exact: true }).click();
  await startGeneration(page, serviceWorker, articleUrl);
  await expect(library.getByText('Generating summary…')).toHaveCount(1);
  await startGeneration(page, serviceWorker, articleUrl, '#other-passage');
  await expect(library.getByText('Generating summary…')).toHaveCount(2);
  await release(articleUrl);
  await expect(library.getByText('Generating summary…')).toHaveCount(1);
  await expect(library.getByText('Organized by the local E2E provider.', { exact: true })).toHaveCount(1);
  await release(articleUrl);
  await expect(library.getByText('Generating summary…')).toHaveCount(0);
  await expect(library.getByText('Organized by the local E2E provider.', { exact: true })).toHaveCount(2);
  expect((await readExtensionData(serviceWorker)).notes).toHaveLength(2);
});

test('ends loading and keeps the saved note after a provider error', async ({
  page,
  context,
  serviceWorker,
  extensionId,
  articleUrl,
}) => {
  await startGeneration(page, serviceWorker, articleUrl);
  const library = await openExtensionPage(context, extensionId, 'options.html');
  await expect(library.locator('article').getByRole('status')).toHaveText('Generating summary…');
  await release(articleUrl, 'error');
  await expect(library.locator('article').getByRole('status')).toHaveText('Summary unavailable. Your note is saved.');
  await expect(library.getByRole('button', { name: 'Edit', exact: true })).toBeEnabled();
  expect((await readExtensionData(serviceWorker)).notes).toHaveLength(1);
});

for (const action of ['edit', 'delete']) {
  test(`does not undo a manual ${action} when generation finishes`, async ({
    page,
    context,
    serviceWorker,
    extensionId,
    articleUrl,
  }) => {
    await startGeneration(page, serviceWorker, articleUrl);
    const library = await openExtensionPage(context, extensionId, 'options.html');
    await expect(library.locator('article').getByRole('status')).toHaveText('Generating summary…');
    if (action === 'edit') {
      await library.getByRole('button', { name: 'Edit', exact: true }).click();
      await library.getByRole('dialog').getByLabel('Summary').fill('My manual summary');
      await library.getByRole('dialog').getByRole('button', { name: 'Save changes', exact: true }).click();
    } else {
      await library.getByRole('button', { name: 'Remove highlight', exact: true }).click();
      await library.getByRole('dialog').getByRole('button', { name: 'Remove highlight', exact: true }).click();
      await expect(library.locator('article')).toHaveCount(0);
    }
    await release(articleUrl);
    await expect(page.locator('#anchor-notes-toast')).toBeVisible();
    const notes = (await readExtensionData(serviceWorker)).notes;
    if (action === 'edit') {
      expect(notes[0]?.summary).toBe('My manual summary');
      await expect(library.getByText('My manual summary', { exact: true })).toBeVisible();
      await expect(library.getByText('Generating summary…')).toHaveCount(0);
    } else {
      expect(notes).toEqual([]);
      await expect(library.locator('article')).toHaveCount(0);
    }
  });
}

test('expires interrupted requests in an open library and after reopening', async ({
  page,
  context,
  serviceWorker,
  extensionId,
  articleUrl,
}) => {
  await startGeneration(page, serviceWorker, articleUrl);
  let library = await openExtensionPage(context, extensionId, 'options.html');
  await expect(library.locator('article').getByRole('status')).toHaveText('Generating summary…');
  const id = (await readExtensionData(serviceWorker)).notes[0]!.id;
  await library.evaluate(async (noteId) => {
    const api = (
      globalThis as unknown as {
        chrome: { storage: { session: { set(items: Record<string, unknown>): Promise<void> } } };
      }
    ).chrome;
    await api.storage.session.set({
      [`anchorNotesSummary:${noteId}`]: { state: 'pending', expiresAt: Date.now() + 200 },
    });
  }, id);
  await expect(library.locator('article').getByRole('status')).toHaveText('Summary unavailable. Your note is saved.');
  await library.close();
  library = await openExtensionPage(context, extensionId, 'options.html');
  await expect(library.locator('article').getByRole('status')).toHaveText('Summary unavailable. Your note is saved.');
  await release(articleUrl);
});

test('does not generate a summary when the independent LLM toggle is disabled', async ({
  page,
  context,
  serviceWorker,
  extensionId,
  articleUrl,
}) => {
  const data = await readExtensionData(serviceWorker);
  await seedExtensionData(serviceWorker, { ...data, settings: { ...data.settings, aiEnabled: false } });
  await startGeneration(page, serviceWorker, articleUrl);
  await expect(page.locator('#anchor-notes-toast')).toBeVisible();
  const library = await openExtensionPage(context, extensionId, 'options.html');
  await expect(library.locator('article')).toHaveCount(1);
  await expect(library.getByText('Generating summary…')).toHaveCount(0);
});
