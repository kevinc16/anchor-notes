import type { Page } from '@playwright/test';
import { DEFAULT_SETTINGS } from '../../lib/settings';
import type { AnchorNote } from '../../lib/types';
import {
  expect,
  test,
  resetExtensionStorage,
  seedExtensionData,
  openExtensionPage,
  readExtensionData,
} from './fixtures';

function note(id: string, url: string): AnchorNote {
  return {
    id,
    url,
    title: `Note ${id}`,
    quote: `Quote ${id}`,
    body: `Body ${id}`,
    summary: `Summary ${id}`,
    tags: ['research'],
    color: 'yellow',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    anchor: {
      quote: { exact: `Quote ${id}`, prefix: '', suffix: '' },
      startPath: '',
      startOffset: 0,
      endPath: '',
      endOffset: 7,
    },
    pageSnapshot: { description: '', capturedAt: '2026-01-01T00:00:00Z' },
  };
}
async function selectAll(library: Page) {
  await library.getByRole('button', { name: 'Select notes', exact: true }).click();
  await library.getByRole('button', { name: /Select all matching/ }).click();
}
async function release(articleUrl: string, error = false) {
  const url = new URL('/release-completion?hold=bulk', articleUrl);
  if (error) url.searchParams.set('result', 'error');
  await expect.poll(async () => (await fetch(url)).status).toBe(200);
}

test.beforeEach(async ({ serviceWorker, articleUrl }) => {
  await resetExtensionStorage(serviceWorker);
  await seedExtensionData(serviceWorker, {
    schemaVersion: 1,
    notes: [note('one', articleUrl), note('two', articleUrl), note('three', 'https://example.com/article')],
    settings: {
      ...DEFAULT_SETTINGS,
      aiEnabled: true,
      aiProvider: 'custom',
      aiModel: 'e2e',
      aiEndpoint: new URL('/v1/chat/completions?hold=bulk', articleUrl).href,
    },
  });
});

test('keeps the selection control focused and clears selection when exiting', async ({ context, extensionId }) => {
  const library = await openExtensionPage(context, extensionId, 'options.html');
  for (const layout of ['Cards', 'List']) {
    await library.getByRole('button', { name: layout, exact: true }).click();
    for (const width of [1280, 390]) {
      await library.setViewportSize({ width, height: 844 });
      const select = library.getByRole('button', { name: 'Select notes', exact: true });
      await select.focus();
      await select.press('Enter');
      const done = library.getByRole('button', { name: 'Done selecting', exact: true });
      await expect(done).toBeFocused();
      await expect(done).toHaveAttribute('aria-expanded', 'true');
      await library.getByRole('button', { name: /Select all matching/ }).click();
      await expect(library.getByText('3 selected', { exact: true })).toBeVisible();
      await done.focus();
      await done.press('Space');
      await expect(select).toBeFocused();
      await expect(select).toHaveAttribute('aria-expanded', 'false');
      await expect(library.getByRole('checkbox')).toHaveCount(0);
      await select.press('Enter');
      await expect(library.getByText('0 selected', { exact: true })).toBeVisible();
      await done.press('Enter');
      await library.getByRole('button', { name: 'Group by website', exact: true }).click();
    }
  }
});

test('selects filtered and collapsed notes and patches tags locally in either layout', async ({
  context,
  serviceWorker,
  extensionId,
}) => {
  let providerRequests = 0;
  context.on('request', (request) => {
    if (request.url().includes('/v1/chat/completions')) providerRequests++;
  });
  const library = await openExtensionPage(context, extensionId, 'options.html');
  await library.getByRole('button', { name: 'example.com 1 note' }).click();
  await selectAll(library);
  await expect(library.getByText('3 selected', { exact: true })).toBeVisible();
  await library.screenshot({ path: test.info().outputPath('bulk-desktop.png'), fullPage: true });
  await library.setViewportSize({ width: 390, height: 844 });
  expect(
    await library.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
  ).toBe(true);
  await library.screenshot({ path: test.info().outputPath('bulk-mobile.png'), fullPage: true });
  await library.setViewportSize({ width: 1280, height: 720 });
  await library.getByLabel('Bulk tags', { exact: true }).fill(' UI, research, ui ');
  await library.getByRole('button', { name: 'Apply tags', exact: true }).click();
  await expect
    .poll(async () => (await readExtensionData(serviceWorker)).notes.map((n) => n.tags))
    .toEqual([
      ['research', 'ui'],
      ['research', 'ui'],
      ['research', 'ui'],
    ]);
  await library.getByRole('button', { name: 'Group by website', exact: true }).click();
  await expect(library.getByRole('checkbox', { checked: true })).toHaveCount(3);
  await library.getByPlaceholder('Search notes, tags, or sources…').fill('Quote one');
  await expect(library.getByText('0 selected', { exact: true })).toBeVisible();
  await library.getByRole('button', { name: /Select all matching/ }).click();
  await library.getByLabel('Tag operation').selectOption('remove');
  await library.getByLabel('Bulk tags', { exact: true }).fill('UI');
  await library.getByRole('button', { name: 'Apply tags', exact: true }).click();
  await expect.poll(async () => (await readExtensionData(serviceWorker)).notes[0]?.tags).toEqual(['research']);
  await library.getByLabel('Tag operation').selectOption('replace');
  await library.getByLabel('Bulk tags', { exact: true }).fill('');
  await expect(library.getByRole('button', { name: 'Clear tags on 1 note', exact: true })).toBeEnabled();
  await library.getByRole('button', { name: 'Clear tags on 1 note', exact: true }).click();
  await expect.poll(async () => (await readExtensionData(serviceWorker)).notes[0]?.tags).toEqual([]);
  expect((await readExtensionData(serviceWorker)).notes[0]).toMatchObject({ body: 'Body one', summary: 'Summary one' });
  expect(providerRequests).toBe(0);
});

test('regenerates with partial failure, survives reopening, and retries only failed notes', async ({
  context,
  extensionId,
  articleUrl,
  serviceWorker,
}) => {
  let library = await openExtensionPage(context, extensionId, 'options.html');
  await selectAll(library);
  await library.getByLabel('AI prompt (optional)', { exact: true }).fill('Focus on browser extension tradeoffs');
  await library.getByRole('button', { name: 'Regenerate tags and summaries', exact: true }).click();
  await expect(library.getByText('Generating summary…')).toHaveCount(2);
  await expect(library.getByText('Waiting for regeneration…', { exact: true })).toHaveCount(1);
  await expect(library.getByRole('button', { name: 'Regenerate tags and summaries', exact: true })).toBeDisabled();
  await library.close();
  library = await openExtensionPage(context, extensionId, 'options.html');
  await expect(library.getByLabel('AI prompt (optional)', { exact: true })).toHaveCount(0);
  await expect(library.getByText('Generating summary…')).toHaveCount(2);
  await release(articleUrl, true);
  const failureAlert = library.getByRole('alert');
  await expect(failureAlert).toContainText('Could not regenerate 1 note.');
  await expect(failureAlert).toContainText('AI request failed (503): The provider is temporarily unavailable.');
  await expect(failureAlert).toContainText('Existing tags and summaries were kept for failed notes.');
  await expect(library.getByText('Regeneration failed. Existing tags and summary kept.', { exact: true })).toHaveCount(
    1,
  );
  await release(articleUrl);
  await release(articleUrl);
  await expect(library.getByRole('status', { name: 'Bulk regeneration progress' })).toContainText(
    '2 completed · 1 failed · 0 skipped',
  );
  const failed = (await readExtensionData(serviceWorker)).notes.filter((n) => n.summary?.startsWith('Summary'));
  expect(failed).toHaveLength(1);
  // The batch alert stays visible even when the failed note is hidden by search.
  await library.getByPlaceholder('Search notes, tags, or sources…').fill('no matching notes');
  await expect(failureAlert).toBeVisible();
  await library.reload();
  await expect(library.getByRole('alert')).toContainText('Could not regenerate 1 note.');
  await expect(library.getByRole('alert')).toContainText('The provider is temporarily unavailable.');
  await library.getByLabel('AI prompt (optional)', { exact: true }).fill('Focus on practical takeaways');
  const retryRequest = context.waitForEvent('request', {
    predicate: (request) => request.method() === 'POST' && request.url().includes('/v1/chat/completions'),
  });
  await library.getByRole('button', { name: 'Retry failed notes', exact: true }).click();
  expect(JSON.parse((await retryRequest).postDataJSON().messages[1].content).guidance).toBe(
    'Focus on practical takeaways',
  );
  await expect(library.getByText('Generating summary…')).toHaveCount(1);
  await release(articleUrl);
  await expect(library.getByRole('status', { name: 'Bulk regeneration progress' })).toContainText(
    '1 completed · 0 failed · 0 skipped',
  );
  await expect(library.getByRole('alert')).toHaveCount(0);
  expect(
    (await readExtensionData(serviceWorker)).notes.every((n) => n.summary === 'Organized by the local E2E provider.'),
  ).toBe(true);
});

test('applies optional guidance only to selected notes and keeps it out of storage', async ({
  context,
  extensionId,
  articleUrl,
  serviceWorker,
}) => {
  const requests: Array<Record<string, string>> = [];
  context.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/v1/chat/completions')) {
      requests.push(JSON.parse(request.postDataJSON().messages[1].content));
    }
  });
  const library = await openExtensionPage(context, extensionId, 'options.html');
  await library.getByRole('button', { name: 'Select notes', exact: true }).click();
  await library.getByPlaceholder('Search notes, tags, or sources…').fill('Quote one');
  await library.getByRole('button', { name: /Select all matching/ }).click();
  const prompt = 'Use browser extension tags and summarize implementation tradeoffs';
  await library.getByLabel('AI prompt (optional)', { exact: true }).fill(prompt);
  await library.getByLabel('Bulk tags', { exact: true }).fill('local');
  await library.getByRole('button', { name: 'Apply tags', exact: true }).click();
  await expect(library.getByRole('status').filter({ hasText: '1 notes updated' })).toBeVisible();
  expect(requests).toEqual([]);
  await library.getByRole('button', { name: 'Regenerate tags and summaries', exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toMatchObject({ quote: 'Quote one', note: 'Body one', guidance: prompt });
  await release(articleUrl);
  await expect(library.getByRole('status', { name: 'Bulk regeneration progress' })).toContainText('1 completed');
  const data = await readExtensionData(serviceWorker);
  expect(data.notes.find((n) => n.id === 'one')).toMatchObject({ quote: 'Quote one', body: 'Body one' });
  expect(data.notes.find((n) => n.id === 'two')).toEqual(note('two', articleUrl));
  expect(data.notes.find((n) => n.id === 'three')).toEqual(note('three', 'https://example.com/article'));
  const stored = await serviceWorker.evaluate(async () => {
    const api = (
      globalThis as unknown as {
        chrome: {
          storage: { local: { get(keys: null): Promise<unknown> }; session: { get(keys: null): Promise<unknown> } };
        };
      }
    ).chrome;
    return JSON.stringify([await api.storage.local.get(null), await api.storage.session.get(null)]);
  });
  expect(stored).not.toContain(prompt);
  await library.reload();
  await library.getByRole('button', { name: 'Select notes', exact: true }).click();
  await expect(library.getByLabel('AI prompt (optional)', { exact: true })).toHaveValue('');
});

test('blocks disabled AI without preventing local tag edits', async ({ context, extensionId, serviceWorker }) => {
  const data = await readExtensionData(serviceWorker);
  await seedExtensionData(serviceWorker, { ...data, settings: { ...data.settings, aiEnabled: false } });
  const library = await openExtensionPage(context, extensionId, 'options.html');
  await selectAll(library);
  await library.getByRole('button', { name: 'Regenerate tags and summaries', exact: true }).click();
  await expect(library.getByRole('alert')).toContainText('Enable an LLM provider in Settings');
  await library.getByLabel('Bulk tags', { exact: true }).fill('local');
  await library.getByRole('button', { name: 'Apply tags', exact: true }).click();
  await expect.poll(async () => (await readExtensionData(serviceWorker)).notes[0]?.tags).toEqual(['research', 'local']);
});

test('rejects overlapping batches and preserves edits and deletions during regeneration', async ({
  context,
  extensionId,
  articleUrl,
  serviceWorker,
}) => {
  const library = await openExtensionPage(context, extensionId, 'options.html');
  await selectAll(library);
  await library.getByRole('button', { name: 'Regenerate tags and summaries', exact: true }).click();
  await expect(library.getByText('Generating summary…')).toHaveCount(2);
  const overlap = await library.evaluate(async () => {
    const api = (
      globalThis as unknown as {
        chrome: { runtime: { sendMessage(message: unknown): Promise<{ ok: boolean; error?: string }> } };
      }
    ).chrome;
    return api.runtime.sendMessage({ type: 'START_BULK_GENERATION', ids: ['three'] });
  });
  expect(overlap.ok).toBe(false);
  expect(overlap.error).toContain('already running');
  const first = library.locator('article').filter({ hasText: 'Quote one' });
  await first.getByRole('button', { name: 'Edit', exact: true }).click();
  await library.getByRole('dialog').getByLabel('Summary').fill('My edited summary');
  await library.getByRole('dialog').getByRole('button', { name: 'Save changes', exact: true }).click();
  await library
    .locator('article')
    .filter({ hasText: 'Quote three' })
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await library.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(library.getByText('2 selected', { exact: true })).toBeVisible();
  await release(articleUrl);
  await release(articleUrl);
  await expect(library.getByRole('status', { name: 'Bulk regeneration progress' })).toContainText(
    '1 completed · 0 failed · 2 skipped',
  );
  const data = await readExtensionData(serviceWorker);
  expect(data.notes).toHaveLength(2);
  expect(data.notes.find((n) => n.id === 'one')).toMatchObject({ summary: 'My edited summary', tags: ['research'] });
  expect(data.notes.find((n) => n.id === 'two')?.summary).toBe('Organized by the local E2E provider.');
});
