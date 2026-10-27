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

test('keeps labeled note content readable in both layouts at narrow widths', async ({
  page,
  serviceWorker,
  extensionId,
  articleUrl,
}) => {
  await seedExtensionData(serviceWorker, {
    schemaVersion: 1,
    settings: DEFAULT_SETTINGS,
    notes: [
      makeNote('readable', articleUrl, {
        title: 'A long source title '.repeat(15),
        body: 'Personal interpretation '.repeat(20),
        summary: 'Summary interpretation '.repeat(20),
        tags: ['research', 'x'.repeat(100)],
      }),
      makeNote('quote-only', articleUrl, { body: '', tags: [] }),
    ],
  });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  const card = page.locator('article').filter({ hasText: 'Personal interpretation' });
  for (const layout of ['Cards', 'List']) {
    await page.getByRole('button', { name: layout, exact: true }).click();
    for (const width of [1280, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(card.getByText('Personal note', { exact: true })).toBeVisible();
      await expect(card.getByText('Summary', { exact: true })).toBeVisible();
      for (const text of [card.locator('time'), card.getByRole('button', { name: 'Filter by tag: research' })]) {
        expect(await text.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(
          12,
        );
      }
      for (const text of [card.getByText(/^Personal interpretation/), card.getByText(/^Summary interpretation/)]) {
        expect(await text.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(
          13,
        );
        expect(await text.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const edit = card.getByRole('button', { name: 'Edit', exact: true });
      await edit.focus();
      await expect(edit).toBeFocused();
      await edit.press('Enter');
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
      if (width === 1280) {
        await page.screenshot({ path: test.info().outputPath(`readable-${layout.toLowerCase()}.png`), fullPage: true });
      }
    }
  }
  const quoteOnly = page.locator('article').filter({ hasNotText: 'Personal interpretation' });
  await expect(quoteOnly.getByText('Personal note', { exact: true })).toHaveCount(0);
  await expect(quoteOnly.getByText('Summary', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('readable-list-320.png'), fullPage: true });
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
          element.compareDocumentPosition(element.closest('article')!.querySelector('blockquote')!),
        ),
      ).toBe(4);
      const headingBox = await heading.boundingBox();
      const dateBox = await card.locator('time').boundingBox();
      expect(headingBox!.y + headingBox!.height).toBeLessThanOrEqual(dateBox!.y);
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
  await page.addStyleTag({ content: 'button, h2 { text-transform: uppercase; }' });
  const targetMarks = page.locator('mark.anchor-note-highlight[data-anchor-id="' + target.id + '"]');
  const otherMarks = page.locator('mark.anchor-note-highlight[data-anchor-id="' + other.id + '"]');
  await expect(targetMarks).toHaveCount(3);
  await expect(otherMarks).toHaveCount(1);
  await targetMarks.first().click();

  const popover = page.locator('#anchor-notes-popover');
  await expect(popover).toBeVisible();
  await expect(popover.locator('.anchor-composer-actions > button')).toHaveText([
    'Open library',
    'Delete',
    'Save changes',
  ]);
  const removeButton = popover.getByRole('button', { name: 'Delete', exact: true });
  await expect(removeButton).toBeVisible();

  const confirmation = page.getByRole('dialog', { name: 'Delete note?' });
  await removeButton.click();
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toHaveCSS('background-color', 'rgb(251, 248, 241)');
  await expect(confirmation).toHaveCSS('color', 'rgb(36, 33, 29)');
  await expect(confirmation).toHaveCSS('border-top-color', 'rgb(230, 223, 212)');
  await expect(confirmation.locator('#anchor-delete-description')).toHaveText(
    'This will delete the saved note and remove its highlight. This cannot be undone.',
  );
  await expect(confirmation.locator('#anchor-delete-description')).toBeVisible();
  await expect(confirmation.locator('button[value="cancel"]')).toHaveCSS('background-color', 'rgb(255, 254, 250)');
  await expect(confirmation.getByRole('heading')).toHaveCSS('text-transform', 'none');
  const cancel = confirmation.getByRole('button', { name: 'Cancel', exact: true });
  await expect(cancel).toHaveCSS('text-transform', 'none');
  await expect(confirmation.getByRole('button', { name: 'Delete', exact: true })).toHaveCSS('text-transform', 'none');
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(confirmation.getByRole('button', { name: 'Delete', exact: true })).toBeFocused();
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
  await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();
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

    await library
      .locator('article')
      .getByRole('button', { name: 'Filter by tag: research', exact: true })
      .first()
      .click();
    await expect(library.getByText('An older idea worth returning to.', { exact: false })).toBeVisible();
    await expect(library.getByText('A newer idea for the product roadmap.', { exact: false })).toBeHidden();
    await library.getByRole('button', { name: 'Clear filters', exact: true }).click();

    await library.getByRole('combobox').selectOption('oldest');
    await expect(library.locator('blockquote').first()).toContainText('An older idea worth returning to.');

    // A settings write refreshes the shared snapshot without resetting library controls.
    await library.getByPlaceholder('Search notes, tags, or sources…').fill('research');
    await library
      .locator('article')
      .getByRole('button', { name: 'Filter by tag: research', exact: true })
      .first()
      .click();
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
    await library.getByRole('button', { name: 'Clear filters', exact: true }).click();
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

    await newerCard.getByRole('button', { name: 'Edit', exact: true }).click();
    await library.getByRole('dialog').getByLabel('Summary').fill('');
    await library.getByRole('dialog').getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(library.getByRole('dialog')).toBeHidden();
    await expect(library.getByText('A manually edited summary.', { exact: true })).toHaveCount(0);
    expect((await readExtensionData(serviceWorker)).notes.find((note) => note.id === 'newer')?.summary).toBeUndefined();
    await newerCard.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(library.getByRole('dialog').getByLabel('Summary')).toHaveValue('');
    await library.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();

    const deleteButton = newerCard.getByRole('button', { name: 'Delete', exact: true });
    await deleteButton.click();
    const confirmation = library.getByRole('dialog', { name: 'Delete note?' });
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toHaveCSS('background-color', 'rgb(251, 248, 241)');
    await expect(confirmation).toHaveCSS('color', 'rgb(36, 33, 29)');
    await expect(confirmation).toHaveCSS('border-top-color', 'rgb(230, 223, 212)');
    await expect(confirmation.locator('#anchor-delete-description')).toHaveText(
      'This will delete the saved note and remove its highlight. This cannot be undone.',
    );
    await expect(confirmation.locator('#anchor-delete-description')).toBeVisible();
    await expect(confirmation.locator('button[value="cancel"]')).toHaveCSS('background-color', 'rgb(255, 254, 250)');
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
    await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();
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
    await expect(card.getByText(body.trim(), { exact: true })).toBeVisible();

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

test('switches reading layouts without losing filters, selection, groups, or expansion', async ({
  page,
  serviceWorker,
  extensionId,
  articleUrl,
}) => {
  const quote = `Reading passage. ${'A useful sentence for a longer reading preview. '.repeat(40)}`;
  await seedExtensionData(serviceWorker, {
    schemaVersion: 1,
    settings: DEFAULT_SETTINGS,
    notes: [
      makeNote('reading-one', articleUrl, {
        quote,
        body: 'Reading one',
        tags: ['research'],
        createdAt: '2025-01-01T00:00:00Z',
      }),
      makeNote('reading-two', 'https://other.example/reading', {
        quote,
        body: 'Reading two',
        tags: ['research'],
        createdAt: '2026-01-01T00:00:00Z',
      }),
      makeNote('excluded', articleUrl, { body: 'Excluded note', tags: ['other'] }),
    ],
  });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  const cards = page.getByRole('button', { name: 'Cards', exact: true });
  const list = page.getByRole('button', { name: 'List', exact: true });
  await expect(cards).toHaveAttribute('aria-pressed', 'true');
  await page.getByPlaceholder('Search notes, tags, or sources…').fill('Reading');
  await page.locator('article').getByRole('button', { name: 'Filter by tag: research', exact: true }).first().click();
  await page.getByRole('combobox', { name: 'Sort notes' }).selectOption('oldest');
  await page.getByRole('button', { name: 'Select notes', exact: true }).click();
  const first = page.locator('article').filter({ hasText: 'Reading one' });
  const second = page.locator('article').filter({ hasText: 'Reading two' });
  await first.getByRole('checkbox').check();
  const group = page.getByRole('button', { name: /other\.example 1 note/ });
  await group.click();
  const compact = (await first.locator('blockquote').innerText()).length;
  await list.focus();
  await page.keyboard.press('Enter');
  await expect(list).toHaveAttribute('aria-pressed', 'true');
  await expect(list).toBeFocused();
  expect((await first.locator('blockquote').innerText()).length).toBeGreaterThan(compact * 3);
  expect((await first.locator('blockquote').innerText()).length).toBeLessThanOrEqual(1202);
  await expect(first.getByRole('checkbox')).toBeChecked();
  await expect(second).toBeHidden();
  await expect(group).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByPlaceholder('Search notes, tags, or sources…')).toHaveValue('Reading');
  await expect(page.getByRole('combobox', { name: 'Sort notes' })).toHaveValue('oldest');
  await page.screenshot({ path: test.info().outputPath('list-reading.png'), fullPage: true });
  await first.getByRole('button', { name: 'Show more', exact: true }).click();
  await expect(first.locator('blockquote')).toContainText(quote);
  await cards.click();
  await expect(first.getByRole('button', { name: 'Show less', exact: true })).toBeVisible();
  await expect(first.getByRole('checkbox')).toBeChecked();
  await list.click();
  await first.getByRole('button', { name: 'Show less', exact: true }).click();
  await page.getByRole('button', { name: 'Group by website', exact: true }).click();
  await expect(second).toBeVisible();
  await expect(page.locator('article')).toHaveCount(2);
  const oneBox = await first.boundingBox();
  const twoBox = await second.boundingBox();
  expect(oneBox!.y + oneBox!.height).toBeLessThanOrEqual(twoBox!.y);
  await expect(first.getByRole('checkbox')).toBeChecked();
  await page.reload();
  await expect(list).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('article')).toHaveCount(3);
  expect((await readExtensionData(serviceWorker)).notes[0]?.quote).toBe(quote);
  await cards.click();
  await page.reload();
  await expect(cards).toHaveAttribute('aria-pressed', 'true');
});

test('uses safe layout defaults and keeps long reading excerpts within narrow windows', async ({
  page,
  serviceWorker,
  extensionId,
  articleUrl,
}) => {
  await seedExtensionData(serviceWorker, {
    schemaVersion: 1,
    settings: DEFAULT_SETTINGS,
    notes: [makeNote('long-token', articleUrl, { quote: 'x'.repeat(1800) })],
  });
  await serviceWorker.evaluate(async () => {
    const api = (
      globalThis as unknown as {
        chrome: { storage: { local: { set(items: Record<string, unknown>): Promise<void> } } };
      }
    ).chrome;
    await api.storage.local.set({ anchorNotesLibraryLayout: { invalid: true } });
  });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(page.getByRole('button', { name: 'Cards', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.getByRole('button', { name: 'Show more', exact: true }).click();
  for (const width of [1280, 640, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('blockquote')).toContainText('x'.repeat(1800));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const quote = await page.locator('blockquote').boundingBox();
    expect(quote!.width).toBeLessThanOrEqual(width);
    await expect(page.getByRole('button', { name: 'List', exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`list-${width}.png`), fullPage: true });
  }
});

test('preserves saved quote whitespace in List previews and expanded quotes', async ({
  page,
  serviceWorker,
  extensionId,
  articleUrl,
}) => {
  const spacing = 'First  line\n\n  Indented paragraph\n\n\nLast line\n';
  const quote = spacing + 'More reading words. '.repeat(80);
  await seedExtensionData(serviceWorker, {
    schemaVersion: 1,
    settings: DEFAULT_SETTINGS,
    notes: [makeNote('spacing-preview', articleUrl, { quote })],
  });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  const blockquote = page.locator('blockquote');
  await page.getByRole('button', { name: 'List', exact: true }).click();
  expect(await blockquote.textContent()).toContain(spacing);
  await expect(blockquote).toHaveCSS('white-space', 'pre-wrap');
  await page.getByRole('button', { name: 'Show more', exact: true }).click();
  expect(await blockquote.textContent()).toBe(`“${quote}”`);
  await page.getByRole('button', { name: 'Show less', exact: true }).click();
  expect(await blockquote.textContent()).toContain(spacing);
  await page.getByRole('button', { name: 'Cards', exact: true }).click();
  expect(await blockquote.textContent()).toContain('First line\nIndented paragraph\nLast line\n');
  expect(await blockquote.textContent()).not.toContain('\n\n');
  expect((await readExtensionData(serviceWorker)).notes[0]?.quote).toBe(quote);
});

test('retrieves rare and exact tags with keyboard controls and clears only search filters', async ({
  page,
  serviceWorker,
  extensionId,
  articleUrl,
}) => {
  const notes = Array.from({ length: 12 }, (_, index) =>
    makeNote(`topic-${index}`, articleUrl, {
      quote: `Synthetic passage ${index}`,
      tags: [`topic-${String(index).padStart(2, '0')}`],
    }),
  );
  notes.push(makeNote('exact', articleUrl, { quote: 'Exact research passage', tags: ['research'] }));
  notes.push(makeNote('substring', articleUrl, { quote: 'Different research passage', tags: ['research-tools'] }));
  notes.push(makeNote('all-tag', articleUrl, { quote: 'A real tag named all', tags: ['all'] }));
  await seedExtensionData(serviceWorker, { schemaVersion: 1, settings: DEFAULT_SETTINGS, notes });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  const topic = page.locator('summary').filter({ hasText: 'Topic:' });
  await expect(topic).toHaveText('Topic: All notes');
  await topic.focus();
  await page.keyboard.press('Enter');
  const tagSearch = page.getByRole('searchbox', { name: 'Find a tag' });
  await expect(tagSearch).toBeFocused();
  await tagSearch.fill('TOPIC-11');
  const picker = page.getByRole('group', { name: 'Available tags', exact: true });
  await expect(picker.getByRole('button', { name: /^Filter by tag:/ })).toHaveCount(1);
  const rare = picker.getByRole('button', { name: 'Filter by tag: topic-11', exact: true });
  await page.keyboard.press('Tab');
  await expect(picker.getByRole('button', { name: 'All notes', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(rare).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(topic).toBeFocused();
  await expect(topic).toHaveText('Topic: topic-11');
  await expect(page.getByRole('status', { name: 'Filter results' })).toContainText('1 of 15 notes');
  await expect(page.locator('article')).toHaveCount(1);
  await expect(page.locator('article')).toContainText('Synthetic passage 11');
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.getByRole('button', { name: 'Group by website', exact: true }).click();
  await page.getByRole('combobox', { name: 'Sort notes' }).selectOption('oldest');
  await page.getByPlaceholder('Search notes, tags, or sources…').fill('no such passage');
  await expect(page.getByRole('status', { name: 'Filter results' })).toContainText('0 of 15 notes');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(15);
  await expect(topic).toHaveText('Topic: All notes');
  await expect(page.getByPlaceholder('Search notes, tags, or sources…')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Group by website', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.getByRole('combobox', { name: 'Sort notes' })).toHaveValue('oldest');
  const research = page
    .locator('article')
    .filter({ hasText: 'Exact research passage' })
    .getByRole('button', { name: 'Filter by tag: research', exact: true });
  await research.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('article')).toHaveCount(1);
  await expect(page.locator('article')).toContainText('Exact research passage');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page
    .locator('article')
    .filter({ hasText: 'A real tag named all' })
    .getByRole('button', { name: 'Filter by tag: all', exact: true })
    .click();
  await expect(page.locator('article')).toHaveCount(1);
  await expect(page.locator('article')).toContainText('A real tag named all');
  await topic.click();
  await tagSearch.fill('missing');
  await expect(page.getByText('No matching tags.', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(topic).toBeFocused();
  await expect(tagSearch).toBeHidden();
});

test('toggles the active tag off and highlights the filtered tag chip', async ({
  page,
  serviceWorker,
  extensionId,
  articleUrl,
}) => {
  const notes = [
    makeNote('tag-toggle-research', articleUrl, {
      quote: 'Searchable research note',
      tags: ['research', 'reading'],
    }),
    makeNote('tag-toggle-reading', articleUrl, {
      quote: 'Searchable reading note',
      tags: ['reading'],
    }),
    makeNote('tag-toggle-other', articleUrl, {
      quote: 'Unmatched research note',
      tags: ['research'],
    }),
  ];
  await seedExtensionData(serviceWorker, { schemaVersion: 1, settings: DEFAULT_SETTINGS, notes });
  await page.goto('chrome-extension://' + extensionId + '/options.html');

  const search = page.getByPlaceholder('Search notes, tags, or sources…');
  const topic = page.locator('summary').filter({ hasText: 'Topic:' });
  await search.fill('Searchable');
  await expect(page.locator('article')).toHaveCount(2);

  const researchCard = page.locator('article').filter({ hasText: 'Searchable research note' });
  const researchTag = researchCard.getByRole('button', { name: 'Filter by tag: research', exact: true });
  const readingTag = researchCard.getByRole('button', { name: 'Filter by tag: reading', exact: true });
  const readingBackground = await readingTag.evaluate((element) => getComputedStyle(element).backgroundColor);

  await researchTag.click();
  await page.mouse.move(0, 0);
  await expect(topic).toHaveText('Topic: research');
  await expect(page.locator('article')).toHaveCount(1);
  await expect(researchTag).toHaveAttribute('aria-pressed', 'true');
  await expect(researchTag).not.toHaveCSS('background-color', readingBackground);

  await researchTag.click();
  await page.mouse.move(0, 0);
  await expect(topic).toHaveText('Topic: All notes');
  await expect(page.locator('article')).toHaveCount(2);
  await expect(search).toHaveValue('Searchable');
  await expect(researchTag).toHaveAttribute('aria-pressed', 'false');
  await expect(researchTag).toHaveCSS('background-color', readingBackground);
});

test('keeps an edited or deleted active tag visible and handles a library without tags', async ({
  page,
  serviceWorker,
  extensionId,
  articleUrl,
}) => {
  const note = makeNote('vanishing-tag', articleUrl, { tags: ['vanishing'] });
  await seedExtensionData(serviceWorker, { schemaVersion: 1, settings: DEFAULT_SETTINGS, notes: [note] });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.locator('article').getByRole('button', { name: 'Filter by tag: vanishing' }).click();
  await seedExtensionData(serviceWorker, {
    schemaVersion: 1,
    settings: DEFAULT_SETTINGS,
    notes: [{ ...note, tags: [] }],
  });
  const result = page.getByRole('status', { name: 'Filter results' });
  await expect(result).toContainText('0 of 1 notes');
  await expect(result).toContainText('Topic: vanishing');
  await page.locator('summary').filter({ hasText: 'Topic:' }).click();
  await expect(page.getByText('No tags yet.', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(1);
  await seedExtensionData(serviceWorker, { schemaVersion: 1, settings: DEFAULT_SETTINGS, notes: [note] });
  await page.locator('article').getByRole('button', { name: 'Filter by tag: vanishing' }).click();
  await seedExtensionData(serviceWorker, { schemaVersion: 1, settings: DEFAULT_SETTINGS, notes: [] });
  await expect(result).toContainText('0 of 0 notes');
  await expect(result).toContainText('Topic: vanishing');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(result).toContainText('Topic: All notes');
  await expect(page.getByRole('button', { name: 'Clear filters', exact: true })).toBeHidden();
});

test('keeps the topic picker compact with dozens of long tags on laptop and narrow screens', async ({
  page,
  serviceWorker,
  extensionId,
  articleUrl,
}) => {
  const tags = Array.from(
    { length: 40 },
    (_, index) => `long-topic-${String(index).padStart(2, '0')}-${'x'.repeat(40)}`,
  );
  await seedExtensionData(serviceWorker, {
    schemaVersion: 1,
    settings: DEFAULT_SETTINGS,
    notes: [makeNote('many-tags', articleUrl, { tags })],
  });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  for (const width of [1280, 1024, 640, 375]) {
    await page.setViewportSize({ width, height: 900 });
    const topic = page.locator('summary').filter({ hasText: 'Topic:' });
    if (width >= 1024) {
      const topicBox = await topic.boundingBox();
      const sortBox = await page.getByRole('combobox', { name: 'Sort notes' }).boundingBox();
      expect(Math.abs(topicBox!.y - sortBox!.y)).toBeLessThan(12);
    }
    await topic.click();
    await page.getByRole('searchbox', { name: 'Find a tag' }).fill('long-topic-39');
    await page
      .getByRole('group', { name: 'Available tags' })
      .getByRole('button', { name: `Filter by tag: ${tags[39]}`, exact: true })
      .click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: test.info().outputPath(`topics-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  }
});

test('keeps tag filtering usable at 200 percent browser zoom', async ({
  page,
  serviceWorker,
  extensionId,
  articleUrl,
}) => {
  await seedExtensionData(serviceWorker, {
    schemaVersion: 1,
    settings: DEFAULT_SETTINGS,
    notes: [makeNote('zoom-tag', articleUrl, { tags: ['reading'], summary: 'A readable summary at browser zoom.' })],
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await serviceWorker.evaluate(async (id) => {
    const api = (
      globalThis as unknown as {
        chrome: {
          tabs: {
            query(query: { url: string }): Promise<Array<{ id?: number }>>;
            setZoom(tabId: number, factor: number): Promise<void>;
          };
        };
      }
    ).chrome;
    const [tab] = await api.tabs.query({ url: `chrome-extension://${id}/options.html` });
    if (tab?.id === undefined) throw new Error('Missing test library tab');
    await api.tabs.setZoom(tab.id, 2);
  }, extensionId);
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(640);
  await page.locator('summary').filter({ hasText: 'Topic:' }).click();
  await page.getByRole('searchbox', { name: 'Find a tag' }).fill('reading');
  await page
    .getByRole('group', { name: 'Available tags' })
    .getByRole('button', { name: 'Filter by tag: reading', exact: true })
    .click();
  await expect(page.getByRole('status', { name: 'Filter results' })).toContainText('1 of 1 notes');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(640);
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.locator('summary')).toHaveText('Topic: All notes');
  const card = page.locator('article');
  await expect(card.getByText('Personal note', { exact: true })).toBeVisible();
  await expect(card.getByText('Summary', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Summary')).toHaveValue('A readable summary at browser zoom.');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.screenshot({ path: test.info().outputPath('topics-200-percent.png'), animations: 'disabled' });
});

test('labels personal notes in the popup without adding empty labels', async ({
  page,
  context,
  serviceWorker,
  extensionId,
  articleUrl,
}) => {
  await seedExtensionData(serviceWorker, {
    schemaVersion: 1,
    settings: DEFAULT_SETTINGS,
    notes: [makeNote('popup-body', articleUrl), makeNote('popup-empty', articleUrl, { body: '' })],
  });
  await page.goto(articleUrl, { waitUntil: 'networkidle' });
  const popup = await openPopupInInactiveTab(context, extensionId, serviceWorker);
  try {
    await expect(popup.locator('article')).toHaveCount(2);
    await expect(popup.getByText('Personal note', { exact: true })).toHaveCount(1);
    const body = popup.getByText('popup-body body', { exact: true });
    await expect(body).toBeVisible();
    expect(await body.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(13);
    await popup.screenshot({ path: test.info().outputPath('readable-popup.png') });
  } finally {
    await popup.close();
  }
});

test('keeps laptop toolbar controls together with wider fallback fonts', async ({
  page,
  serviceWorker,
  extensionId,
}) => {
  await seedExtensionData(serviceWorker, { schemaVersion: 1, settings: DEFAULT_SETTINGS, notes: [] });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  // System and native-control font metrics vary between macOS and the Linux CI runner.
  await page.addStyleTag({ content: 'main summary, main button, main select { font-family: Verdana, sans-serif; }' });
  for (const width of [1280, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    const topic = await page.locator('summary').boundingBox();
    const topicLabel = await page.locator('summary > span').boundingBox();
    expect(Math.abs(topicLabel!.y + topicLabel!.height / 2 - topic!.y - topic!.height / 2)).toBeLessThanOrEqual(1);
    const cards = await page.getByRole('button', { name: 'Cards', exact: true }).boundingBox();
    expect(topic!.height).toBeCloseTo(cards!.height, 0);
    const sort = await page.getByRole('combobox', { name: 'Sort notes' }).boundingBox();
    expect(Math.abs(topic!.y - sort!.y)).toBeLessThan(12);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});
