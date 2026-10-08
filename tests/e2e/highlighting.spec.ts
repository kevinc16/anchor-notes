import { DEFAULT_SETTINGS } from '../../lib/settings';
import type { AnchorData, AnchorNote } from '../../lib/types';
import {
  expect,
  readExtensionData,
  resetExtensionStorage,
  seedExtensionData,
  test,
  triggerCaptureSelection,
} from './fixtures';

const PASSAGE = 'Anchor Notes keeps important ideas attached to the page, even when its markup changes.';

test.beforeEach(async ({ serviceWorker }) => {
  await resetExtensionStorage(serviceWorker);
});

test('saves a selected passage with a note and renders the configured highlight', async ({
  page,
  serviceWorker,
  articleUrl,
}) => {
  await page.goto(`${articleUrl}#capture`, { waitUntil: 'networkidle' });
  await page.locator('#passage').selectText();
  await triggerCaptureSelection(serviceWorker);

  const composer = page.locator('#anchor-notes-composer');
  await expect(composer).toBeVisible();
  await composer.locator('textarea').fill('A research note about API architecture.');
  await composer.getByRole('button', { name: 'Use mint highlight' }).click();
  await composer.getByRole('button', { name: 'Save note' }).click();

  const marks = page.locator('mark.anchor-note-highlight');
  await expect(marks.first()).toBeVisible();
  await expect(marks.first()).toHaveAttribute('data-anchor-color', 'mint');
  await expect(marks.first()).toHaveAttribute('data-anchor-coverage', 'medium');
  await expect(page.locator('#anchor-notes-toast')).toHaveText('Highlight anchored');

  const savedData = await readExtensionData(serviceWorker);
  expect(savedData.notes).toHaveLength(1);
  expect(savedData.notes[0]).toMatchObject({
    url: `${articleUrl}#capture`,
    canonicalUrl: articleUrl,
    quote: PASSAGE,
    body: 'A research note about API architecture.',
    color: 'mint',
  });
  expect(savedData.notes[0]?.tags).toEqual(expect.arrayContaining(['research', 'engineering']));
});

test('restores a highlight after a same-url markup change', async ({ page, serviceWorker, articleUrl }) => {
  const now = new Date().toISOString();
  const note: AnchorNote = {
    id: 'restore-note',
    url: articleUrl,
    canonicalUrl: articleUrl,
    title: 'Anchor Notes E2E fixture',
    quote: PASSAGE,
    body: 'Restore this note after the article changes shape.',
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
    color: 'coral',
    tags: ['testing'],
    createdAt: now,
    updatedAt: now,
  };
  const data: AnchorData = {
    schemaVersion: 1,
    notes: [note],
    settings: { ...DEFAULT_SETTINGS, highlightCoverage: 'full' },
  };
  await seedExtensionData(serviceWorker, data);

  await page.goto(`${articleUrl}#restore`, { waitUntil: 'networkidle' });
  await expect.poll(() => page.locator('mark.anchor-note-highlight').count()).toBeGreaterThan(0);

  await page.evaluate(() => localStorage.setItem('anchor-test-version', 'changed'));
  await page.reload({ waitUntil: 'networkidle' });

  const marks = page.locator('mark.anchor-note-highlight');
  await expect.poll(() => marks.count()).toBeGreaterThan(0);
  await expect(marks.first()).toHaveAttribute('data-anchor-color', 'coral');
  await expect(marks.first()).toHaveAttribute('data-anchor-coverage', 'full');
  await expect
    .poll(async () => marks.evaluateAll((items) => items.map((item) => item.textContent ?? '').join('')))
    .toBe(PASSAGE);
});
