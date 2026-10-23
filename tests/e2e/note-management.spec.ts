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

test('distinguishes articles by title and falls back to the hostname for blank titles', async ({
  page,
  serviceWorker,
  extensionId,
  articleUrl,
}) => {
  const longTitle = 'A long article title about keeping useful ideas attached to their original source '
    .repeat(8)
    .trim();
  const titles = ['First article on this website', 'Second article on this website', longTitle, '', '   '];
  await seedExtensionData(serviceWorker, {
    schemaVersion: 1,
    settings: DEFAULT_SETTINGS,
    notes: titles.map((title, index) =>
      makeNote(`title-${index}`, `${articleUrl}?article=${index}`, { title, body: `Article ${index}` }),
    ),
  });
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [index, title] of titles.entries()) {
      const card = page.locator('article').filter({ hasText: `Article ${index}` });
      const heading = card.getByRole('heading', { name: title.trim() || '127.0.0.1', exact: true });
      await expect(heading).toBeVisible();
      await expect(heading).toHaveAttribute('title', title.trim() || '127.0.0.1');
      await expect(card.locator('header')).toContainText('127.0.0.1');
      await expect(card.locator('time')).not.toBeEmpty();
      expect(
        await heading.evaluate((element) =>
          element.compareDocumentPosition(element.parentElement!.querySelector('blockquote')!),
        ),
      ).toBe(4);
      const dimensions = await heading.evaluate((element) => ({
        height: element.getBoundingClientRect().height,
        lineHeight: parseFloat(getComputedStyle(element).lineHeight),
        scrollHeight: element.scrollHeight,
      }));
      expect(dimensions.height).toBeLessThanOrEqual(dimensions.lineHeight * 2 + 1);
      if (index === 2) expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
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

test('removes a saved highlight from the page editor', async ({
  page,
  context,
  serviceWorker,
  extensionId,
  articleUrl,
}) => {
  const target = makeNote('remove-target', articleUrl, { body: 'Remove this highlight.' });
  const otherQuote = 'A separate saved thought remains visible.';
  const other = makeNote('keep-other', articleUrl, {
    quote: otherQuote,
    body: 'Keep this other highlight.',
    anchor: {
      ...target.anchor,
      quote: { exact: otherQuote, prefix: '', suffix: '' },
      endOffset: otherQuote.length,
    },
  });
  await seedExtensionData(serviceWorker, {
    schemaVersion: 1,
    notes: [target, other],
    settings: DEFAULT_SETTINGS,
  });

  await page.goto(articleUrl + '#remove', { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: 'button { text-transform: uppercase; }' });
  const targetMarks = page.locator('mark.anchor-note-highlight[data-anchor-id="' + target.id + '"]');
  const otherMarks = page.locator('mark.anchor-note-highlight[data-anchor-id="' + other.id + '"]');
  await expect(targetMarks).toHaveCount(3);
  await expect(otherMarks).toHaveCount(1);
  await targetMarks.first().click();

  const popover = page.locator('#anchor-notes-popover');
  await expect(popover).toBeVisible();
  await expect(popover.locator('.anchor-composer-actions > button')).toHaveText([
    'Open library',
    'Remove highlight',
    'Save changes',
  ]);
  const removeButton = popover.getByRole('button', { name: 'Remove highlight', exact: true });
  await expect(removeButton).toBeVisible();

  const confirmation = page.getByRole('dialog', { name: 'Delete note?' });
  await removeButton.click();
  await expect(confirmation).toBeVisible();
  const cancel = confirmation.getByRole('button', { name: 'Cancel', exact: true });
  await expect(cancel).toHaveCSS('text-transform', 'none');
  await expect(confirmation.getByRole('button', { name: 'Delete note', exact: true })).toHaveCSS(
    'text-transform',
    'none',
  );
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(confirmation.getByRole('button', { name: 'Delete note', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(cancel).toBeFocused();
  await page.screenshot({ path: test.info().outputPath('page-delete-confirmation.png') });
  await cancel.click();
  await expect(confirmation).toBeHidden();
  await expect(removeButton).toBeFocused();
  await expect(popover).toBeVisible();
  await expect(targetMarks).toHaveCount(3);
  expect((await readExtensionData(serviceWorker)).notes.map((note) => note.id)).toEqual(
    expect.arrayContaining([target.id, other.id]),
  );

  await removeButton.click();
  await expect(confirmation).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(confirmation).toBeHidden();
  await expect(popover).toBeVisible();
  await expect(removeButton).toBeFocused();
  await expect(targetMarks).toHaveCount(3);

  await removeButton.click();
  await confirmation.getByRole('button', { name: 'Delete note', exact: true }).click();
  await expect(popover).toBeHidden();
  await expect(page.locator('#anchor-notes-toast')).toHaveText('Highlight removed');
  await expect(targetMarks).toHaveCount(0);
  await expect(otherMarks).toHaveCount(1);
  await expect(otherMarks.first()).toHaveText(otherQuote);

  const savedData = await readExtensionData(serviceWorker);
  expect(savedData.notes.map((note) => note.id)).toEqual([other.id]);

  const library = await openExtensionPage(context, extensionId, 'options.html');
  try {
    await expect(library.getByText(PASSAGE, { exact: false })).toBeHidden();
    await expect(library.getByText(otherQuote, { exact: false })).toBeVisible();
  } finally {
    await library.close();
  }
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
    createdAt: '2025-06-01T00:00:00.000Z',
    updatedAt: '2025-06-01T00:00:00.000Z',
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

    // A settings write refreshes the shared snapshot without resetting library controls.
    await library.getByPlaceholder('Search notes, tags, or sources…').fill('research');
    await library.getByRole('button', { name: 'research', exact: true }).click();
    await library.getByRole('button', { name: 'Group by website', exact: true }).click();
    await library.getByRole('button', { name: /Settings/ }).click();
    await library.getByRole('button', { name: 'Coral', exact: true }).click();
    await library.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(library.getByText('Settings saved', { exact: true })).toBeVisible();
    expect((await readExtensionData(serviceWorker)).settings.highlightColor).toBe('coral');
    await library.getByRole('button', { name: /Library/ }).click();
    await expect(library.getByPlaceholder('Search notes, tags, or sources…')).toHaveValue('research');
    await expect(library.getByRole('combobox')).toHaveValue('oldest');
    await expect(library.getByRole('button', { name: 'Group by website', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(library.locator('article:visible')).toHaveCount(1);
    await expect(library.locator('article:visible')).toContainText('Older research note');
    await library.getByPlaceholder('Search notes, tags, or sources…').fill('');
    await library.getByRole('button', { name: 'All notes', exact: true }).click();
    await library.getByRole('button', { name: 'Group by website', exact: true }).click();

    await library.getByRole('combobox').selectOption('newest');
    await expect(library.locator('blockquote').first()).toContainText('A newer idea for the product roadmap.');

    const newerCard = library.locator('article').filter({ hasText: 'A newer idea for the product roadmap.' });
    await newerCard.getByRole('button', { name: 'Edit' }).click();
    const dialog = library.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Your note').fill('Edited product note');
    await dialog.getByLabel('Summary').fill('A manually edited summary.');
    await dialog.getByLabel('Tags (comma separated)').fill('product, edited');
    await dialog.getByRole('button', { name: 'Lilac', exact: true }).click();
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();
    await expect(newerCard.getByText('Edited product note', { exact: true })).toBeVisible();
    await expect(library.getByText('A manually edited summary.', { exact: true })).toBeVisible();

    const deleteButton = newerCard.getByRole('button', { name: 'Delete', exact: true });
    await deleteButton.click();
    const confirmation = library.getByRole('dialog', { name: 'Delete note?' });
    await expect(confirmation).toBeVisible();
    await expect(confirmation.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await library.screenshot({ path: test.info().outputPath('library-delete-confirmation.png') });
    await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(newerCard).toBeVisible();
    await expect(deleteButton).toBeFocused();
    await deleteButton.click();
    await library.keyboard.press('Escape');
    await expect(confirmation).toBeHidden();
    await expect(newerCard).toBeVisible();
    await deleteButton.click();
    await confirmation.getByRole('button', { name: 'Delete note', exact: true }).click();
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
    expect(await quotePreview.textContent()).toContain(getLibraryCardPreview(quote));
    expect(await quotePreview.textContent()).toContain('...');
    expect(await quotePreview.textContent()).not.toContain('…');
    await expect(quotePreview.getByRole('button')).toHaveCount(0);
    const quoteToggle = card.getByRole('button', { name: 'Show more' });
    await expect(quoteToggle).toBeVisible();
    await expect(quoteToggle).toHaveClass(/font-sans/);
    await expect(quoteToggle).toHaveClass(/text-meta/);
    const quoteToggleClass = await quoteToggle.getAttribute('class');
    await quoteToggle.click();
    expect(await quotePreview.textContent()).toContain(quote);
    const collapseQuoteToggle = card.getByRole('button', { name: 'Show less' });
    await expect(collapseQuoteToggle).toBeVisible();
    await expect(collapseQuoteToggle).toHaveClass(/font-sans/);
    await expect(collapseQuoteToggle).toHaveClass(/text-meta/);
    expect(await collapseQuoteToggle.getAttribute('class')).toBe(quoteToggleClass);
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
