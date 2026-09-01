import { DEFAULT_SETTINGS } from '../../lib/settings';
import { getLibraryCardPreview } from '../../lib/note-preview';
import type { AnchorData, AnchorNote } from '../../lib/types';
import {
  expect,
  openExtensionPage,
  openPopupInInactiveTab,
  readExtensionData,
  resetExtensionStorage,
  seedExtensionData,
  test,
} from './fixtures';

const PASSAGE = 'Anchor Notes keeps important ideas attached to the page, even when its markup changes.';

function makeNote(id: string, url: string, overrides: Partial<AnchorNote> = {}): AnchorNote {
  const now = new Date().toISOString();
  return {
    id,
    url,
    canonicalUrl: url.split('#')[0],
    title: 'Anchor Notes E2E fixture',
    quote: PASSAGE,
    body: `${id} body`,
    anchor: {
      quote: { exact: PASSAGE, prefix: '', suffix: '' },
      startPath: 'body',
      startOffset: 0,
      endPath: 'body',
      endOffset: PASSAGE.length,
    },
    pageSnapshot: {
      description: 'A deterministic article used by Anchor Notes browser tests.',
      capturedAt: now,
    },
    color: 'yellow',
    tags: ['research'],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test.beforeEach(async ({ serviceWorker }) => {
  await resetExtensionStorage(serviceWorker);
});

test('edits a saved highlight from the page editor', async ({ page, serviceWorker, articleUrl }) => {
  const note = makeNote('page-editor-note', articleUrl, { body: 'Original note', tags: ['research'] });
  await seedExtensionData(serviceWorker, {
    schemaVersion: 1,
    notes: [note],
    settings: DEFAULT_SETTINGS,
  });

  await page.goto(`${articleUrl}#editor`, { waitUntil: 'networkidle' });
  const mark = page.locator('mark.anchor-note-highlight').first();
  await expect(mark).toBeVisible();
  await mark.click();

  const popover = page.locator('#anchor-notes-popover');
  await expect(popover).toBeVisible();
  await popover.getByRole('button', { name: 'Use coral highlight' }).click();
  await expect(popover).toBeVisible();
  await expect.poll(async () => (await readExtensionData(serviceWorker)).notes[0]?.color).toBe('coral');
  await popover.locator('textarea').fill('Updated from the page editor.');
  await popover.locator('.anchor-tags-input').fill('UI, research, ui');
  await popover.getByRole('button', { name: 'Save changes' }).click();

  await expect(popover).toBeHidden();
  await expect(page.locator('#anchor-notes-toast')).toHaveText('Note updated');
  await expect(mark).toHaveAttribute('data-anchor-color', 'coral');

  const savedData = await readExtensionData(serviceWorker);
  expect(savedData.notes[0]).toMatchObject({
    id: note.id,
    body: 'Updated from the page editor.',
    tags: ['ui', 'research'],
    color: 'coral',
  });
});

test('shows only the active page notes in the popup and can scroll to one', async ({
  page,
  context,
  serviceWorker,
  extensionId,
  articleUrl,
}) => {
  const activeNote = makeNote('popup-note', articleUrl, { body: 'Visible on the current page.' });
  const otherNote = makeNote('other-page-note', 'https://other.example/notes', {
    body: 'Hidden from the current page.',
  });
  await seedExtensionData(serviceWorker, {
    schemaVersion: 1,
    notes: [activeNote, otherNote],
    settings: DEFAULT_SETTINGS,
  });

  await page.goto(`${articleUrl}#popup`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    document.body.style.paddingTop = '1600px';
  });

  const popup = await openPopupInInactiveTab(context, extensionId, serviceWorker);
  try {
    await expect(popup.getByText('1 highlight', { exact: true })).toBeVisible();
    await expect(popup.getByText('Visible on the current page.', { exact: true })).toBeVisible();
    await expect(popup.getByText('Hidden from the current page.', { exact: true })).toBeHidden();

    await popup.getByRole('button', { name: 'Show on page' }).click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  } finally {
    if (!popup.isClosed()) await popup.close();
  }
});

test('searches, groups, edits, and deletes notes in the library', async ({
  context,
  serviceWorker,
  extensionId,
  articleUrl,
}) => {
  const older = makeNote('older-note', `${articleUrl}#older`, {
    quote: 'An older idea worth returning to.',
    body: 'Older research note',
    tags: ['research', 'older'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  });
  const newer = makeNote('newer-note', `${articleUrl}#newer`, {
    quote: 'A newer idea for the product roadmap.',
    body: 'Newer product note',
    tags: ['product'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  const otherSite = makeNote('other-site-note', 'https://other.example/notes', {
    quote: 'A note from another source.',
    body: 'Other source note',
    tags: ['learning'],
  });
  await seedExtensionData(serviceWorker, {
    schemaVersion: 1,
    notes: [newer, older, otherSite],
    settings: DEFAULT_SETTINGS,
  });

  const library = await openExtensionPage(context, extensionId, 'options.html');
  try {
    await expect(library.getByRole('heading', { name: 'Saved from the web' })).toBeVisible();
    await expect(library.locator('section[aria-label="127.0.0.1 notes"]')).toContainText('2 notes');
    await expect(library.locator('section[aria-label="other.example notes"]')).toContainText('1 note');

    const localGroup = library.locator('section[aria-label="127.0.0.1 notes"]');
    await localGroup.getByRole('button', { name: /127\.0\.0\.1 2 notes/ }).click();
    await expect(localGroup.locator('div[id^="website-notes-"]')).toBeHidden();
    await localGroup.getByRole('button', { name: /127\.0\.0\.1 2 notes/ }).click();

    await library.getByPlaceholder('Search notes, tags, or sources…').fill('product roadmap');
    await expect(library.getByText('A newer idea for the product roadmap.', { exact: false })).toBeVisible();
    await expect(library.getByText('An older idea worth returning to.', { exact: false })).toBeHidden();
    await library.getByPlaceholder('Search notes, tags, or sources…').fill('');

    await library.getByRole('button', { name: 'research', exact: true }).click();
    await expect(library.getByText('An older idea worth returning to.', { exact: false })).toBeVisible();
    await expect(library.getByText('A newer idea for the product roadmap.', { exact: false })).toBeHidden();
    await library.getByRole('button', { name: 'All notes', exact: true }).click();

    await library.getByRole('combobox').selectOption('oldest');
    await expect(library.locator('blockquote').first()).toContainText('An older idea worth returning to.');

    const newerCard = library.locator('article').filter({ hasText: 'A newer idea for the product roadmap.' });
    await newerCard.getByRole('button', { name: 'Edit' }).click();
    const dialog = library.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Your note').fill('Edited product note');
    await dialog.getByLabel('Summary').fill('A manually edited summary.');
    await dialog.getByLabel('Tags (comma separated)').fill('product, edited');
    await dialog.getByRole('button', { name: 'Lilac', exact: true }).click();
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(library.getByText('Edited product note', { exact: true })).toBeVisible();
    await expect(library.getByText('A manually edited summary.', { exact: true })).toBeVisible();

    library.once('dialog', (browserDialog) => browserDialog.accept());
    await newerCard.getByRole('button', { name: 'Delete' }).click();
    await expect(library.getByText('A newer idea for the product roadmap.', { exact: false })).toBeHidden();
  } finally {
    await library.close();
  }
});

test('cleans and bounds library card previews without changing the editable note', async ({
  context,
  serviceWorker,
  extensionId,
  articleUrl,
}) => {
  const quote = `<p>First line <strong>with markup</strong></p>\n\nSecond line\n\n\n${'A long trailing quote. '.repeat(20)}`;
  const body = `The full note body remains available. ${'Keep this content. '.repeat(20)}`;
  const note = makeNote('preview-note', articleUrl, { quote, body });
  await seedExtensionData(serviceWorker, {
    schemaVersion: 1,
    notes: [note],
    settings: DEFAULT_SETTINGS,
  });

  const library = await openExtensionPage(context, extensionId, 'options.html');
  try {
    const card = library.locator('article').first();
    const quotePreview = card.locator('blockquote');
    await expect(quotePreview).toBeVisible();
    expect(await quotePreview.textContent()).toContain(getLibraryCardPreview(quote).slice(0, -1));
    await expect(card.getByRole('button', { name: 'Show full quote' })).toBeVisible();
    await card.getByRole('button', { name: 'Show full quote' }).click();
    expect(await quotePreview.textContent()).toContain(quote);
    await expect(card.getByRole('button', { name: 'Collapse quote' })).toBeVisible();
    await expect(card.locator('p').first()).toHaveText(body);

    await card.getByRole('button', { name: 'Edit' }).click();
    const dialog = library.getByRole('dialog');
    await expect(dialog.getByLabel('Your note')).toHaveValue(body);
    expect(await dialog.locator('blockquote').textContent()).toBe(`“${quote}”`);
  } finally {
    await library.close();
  }
});

test('exports and imports a JSON backup', async ({ context, serviceWorker, extensionId, articleUrl }) => {
  const note = makeNote('backup-note', articleUrl, { body: 'Note to back up.' });
  await seedExtensionData(serviceWorker, {
    schemaVersion: 1,
    notes: [note],
    settings: DEFAULT_SETTINGS,
  });

  const library = await openExtensionPage(context, extensionId, 'options.html');
  try {
    await library.evaluate(() => {
      const testWindow = window as Window & {
        anchorExportBlob?: Blob;
        anchorExportName?: string;
      };
      const createObjectUrl = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob: Blob) => {
        testWindow.anchorExportBlob = blob;
        return createObjectUrl(blob);
      };
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function clickExport() {
        testWindow.anchorExportName = this.download;
        click.call(this);
      };
    });
    await library.getByRole('button', { name: 'Export backup' }).click();
    const exportedCapture = await library.evaluate(async () => {
      const testWindow = window as Window & {
        anchorExportBlob?: Blob;
        anchorExportName?: string;
      };
      if (!testWindow.anchorExportBlob) throw new Error('Export did not create a backup blob.');
      return {
        name: testWindow.anchorExportName,
        text: await testWindow.anchorExportBlob.text(),
      };
    });
    expect(exportedCapture.name).toMatch(/^anchor-notes-\d{4}-\d{2}-\d{2}\.json$/);
    const exported = JSON.parse(exportedCapture.text) as AnchorData;
    expect(exported.notes).toHaveLength(1);
    expect(exported.notes[0]).toMatchObject({ id: note.id, body: note.body });

    const imported = makeNote('imported-note', 'https://import.example/notes', { body: 'Imported note.' });
    await library.getByRole('button', { name: /Settings/ }).click();
    await expect(library.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await library.locator('input[type="file"]').setInputFiles({
      name: 'anchor-notes-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, notes: [imported] })),
    });
    await expect(library.getByText('Backup imported', { exact: true })).toBeVisible();

    const savedData = await readExtensionData(serviceWorker);
    expect(savedData.notes.map((savedNote) => savedNote.id)).toEqual(expect.arrayContaining([note.id, imported.id]));
  } finally {
    await library.close();
  }
});
