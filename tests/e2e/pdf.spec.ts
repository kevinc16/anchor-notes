import path from 'node:path';
import { test, expect, readExtensionData, seedExtensionData } from './fixtures';

test('explicit URL opening uses bundled viewer navigation and selectable text', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/pdf.html`);
  await page.getByLabel('PDF URL').fill('http://127.0.0.1:4173/pdf-document');
  await page.getByRole('button', { name: 'Open PDF', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('PDF opened');
  const viewer = page.frameLocator('#pdf-viewer');
  await expect(viewer.locator('.textLayer').first()).toContainText('Anchor PDF research');
  await viewer.locator('#pageNumber').fill('3');
  await viewer.locator('#pageNumber').press('Enter');
  await expect(viewer.locator('.page[data-page-number="3"] .textLayer')).toContainText('Final page');
});

test('local files open and failed URL requests offer fallback', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/pdf.html`);
  await page.getByLabel('Choose PDF file').setInputFiles(path.resolve('tests/e2e/fixtures/research.pdf'));
  await expect(page.getByRole('status')).toContainText('PDF opened');
  await expect(page).toHaveURL(/source=anchor-notes/);
  await page.getByLabel('PDF URL').fill('http://127.0.0.1:4173/article');
  await page.getByRole('button', { name: 'Open PDF', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('not a PDF');
  await expect(page.getByRole('link', { name: 'Open original' })).toBeVisible();
});

test('password-protected PDFs reject with usable fallback instead of hanging', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/pdf.html`);
  await page.getByLabel('Choose PDF file').setInputFiles(path.resolve('tests/e2e/fixtures/protected.pdf'));
  await expect(page.getByRole('status')).toContainText('Password-protected');
});

test('viewer Open shortcut routes through the host and updates source identity', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(
    `chrome-extension://${extensionId}/pdf.html?source=${encodeURIComponent('http://127.0.0.1:4173/pdf-document')}`,
  );
  await expect(page.getByRole('status')).toContainText('PDF opened');
  const chooser = page.waitForEvent('filechooser');
  await page.frameLocator('#pdf-viewer').locator('body').press('Control+o');
  await (await chooser).setFiles(path.resolve('tests/e2e/fixtures/research.pdf'));
  await expect(page).toHaveTitle('research.pdf — Anchor Notes');
  await expect(page.getByRole('link', { name: 'Open original' })).toBeHidden();
});

test('keeps a local PDF once and reopens it offline after reload', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/pdf.html`);
  await page.getByLabel('Choose PDF file').setInputFiles(path.resolve('tests/e2e/fixtures/research.pdf'));
  await expect(page.getByRole('status')).toContainText('PDF opened');
  await page.getByRole('button', { name: 'Keep PDF on this device', exact: true }).click();
  await expect(page.getByRole('button', { name: 'PDF kept on this device', exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Saved PDF opened');
  await expect(page.frameLocator('#pdf-viewer').locator('.textLayer').first()).toContainText('Anchor PDF research');
  const library = await context.newPage();
  await library.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(library.getByRole('region', { name: 'Saved PDFs' })).toContainText('research.pdf');
  await library.getByRole('button', { name: 'Remove saved PDF' }).click();
  await expect(library.getByRole('region', { name: 'Saved PDFs' })).toContainText('No PDFs kept');
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Choose the same PDF');
});

test('failed PDF retention leaves viewing usable and never shows a false saved state', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/pdf.html`);
  await page.getByLabel('Choose PDF file').setInputFiles(path.resolve('tests/e2e/fixtures/research.pdf'));
  await expect(page.getByRole('status')).toContainText('PDF opened');
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = () => {
      throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
    };
  });
  await page.getByRole('button', { name: 'Keep PDF on this device', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Could not keep PDF');
  await expect(page.getByRole('button', { name: 'Keep PDF on this device', exact: true })).toBeEnabled();
  await expect(page.frameLocator('#pdf-viewer').locator('.textLayer').first()).toContainText('Anchor PDF research');
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Choose the same PDF');
});

test('replacing a saved PDF clears the previous retained-document identity', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/pdf.html`);
  await page.getByLabel('Choose PDF file').setInputFiles(path.resolve('tests/e2e/fixtures/research.pdf'));
  await expect(page.getByRole('status')).toContainText('PDF opened');
  await page.getByRole('button', { name: 'Keep PDF on this device', exact: true }).click();
  await expect(page.getByRole('button', { name: 'PDF kept on this device' })).toBeVisible();
  const library = await context.newPage();
  await library.goto(`chrome-extension://${extensionId}/options.html`);
  const href = await library
    .getByRole('region', { name: 'Saved PDFs' })
    .getByRole('link', { name: 'research.pdf' })
    .getAttribute('href');
  await page.goto(href!);
  await expect(page.getByRole('status')).toContainText('Saved PDF opened');
  await page.getByLabel('Choose PDF file').setInputFiles(path.resolve('tests/e2e/fixtures/second.pdf'));
  await expect(page).toHaveTitle('second.pdf — Anchor Notes');
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Choose the same PDF');
});

test('identical bytes from another URL share storage and reopen without network', async ({ context, extensionId }) => {
  const page = await context.newPage();
  const source = 'http://127.0.0.1:4173/pdf-document';
  await page.goto(`chrome-extension://${extensionId}/pdf.html?source=${encodeURIComponent(source)}`);
  await expect(page.getByRole('status')).toContainText('PDF opened');
  await page.getByRole('button', { name: 'Keep PDF on this device', exact: true }).click();
  await expect(page.getByRole('button', { name: 'PDF kept on this device' })).toBeVisible();
  await page.getByLabel('PDF URL').fill(source + '-2');
  await page.getByRole('button', { name: 'Open PDF', exact: true }).click();
  await expect(page).toHaveTitle('pdf-document-2 — Anchor Notes');
  await expect(page.getByRole('button', { name: 'PDF kept on this device' })).toBeVisible();
  await context.setOffline(true);
  await page.goto(`chrome-extension://${extensionId}/pdf.html?source=${encodeURIComponent(source + '-2')}`);
  await expect(page.getByRole('status')).toContainText('Saved PDF opened');
  const library = await context.newPage();
  await library.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(
    library.getByRole('region', { name: 'Saved PDFs' }).getByRole('button', { name: 'Remove saved PDF' }),
  ).toHaveCount(1);
});

test('saves PDF highlights against the source and restores after retained reload and zoom', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const page = await context.newPage();
  await page.goto(
    `chrome-extension://${extensionId}/pdf.html?source=${encodeURIComponent('http://127.0.0.1:4173/pdf-document')}`,
  );
  await expect(page.getByRole('status')).toContainText('PDF opened');
  const viewer = page.frameLocator('#pdf-viewer');
  const text = viewer
    .locator('.page[data-page-number="1"] .textLayer span')
    .filter({ hasText: 'Anchor PDF research' })
    .first();
  await text.evaluate((node) => {
    const range = node.ownerDocument.createRange();
    range.selectNodeContents(node);
    const selection = node.ownerDocument.defaultView!.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.getByRole('button', { name: 'Save highlight', exact: true }).click();
  await viewer.locator('#anchor-notes-composer textarea').fill('PDF research note');
  await viewer.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(viewer.locator('.anchor-pdf-highlight').first()).toBeVisible();
  const saved = await readExtensionData(serviceWorker);
  await seedExtensionData(serviceWorker, { ...saved, settings: { ...saved.settings, highlightCoverage: 'full' } });
  await expect(viewer.locator('.anchor-pdf-highlight').first()).toHaveAttribute('data-anchor-coverage', 'full');
  const data = await serviceWorker.evaluate(async () => {
    const chromeApi = (
      globalThis as unknown as {
        chrome: { storage: { local: { get(key: string): Promise<Record<string, unknown>> } } };
      }
    ).chrome;
    return (await chromeApi.storage.local.get('anchorNotesData')).anchorNotesData;
  });
  expect(data).toMatchObject({
    notes: [
      {
        url: 'http://127.0.0.1:4173/pdf-document',
        body: 'PDF research note',
        anchor: { pdf: { pageNumber: 1, version: 1 } },
      },
    ],
  });
  await page.getByRole('button', { name: 'Keep PDF on this device', exact: true }).click();
  await expect(page.getByRole('button', { name: 'PDF kept on this device' })).toBeVisible();
  await page.reload();
  await expect(viewer.locator('.anchor-pdf-highlight').first()).toBeVisible();
  await viewer.locator('#scaleSelect').selectOption('1.5');
  await expect(viewer.locator('.anchor-pdf-highlight')).toHaveCount(1);
  await viewer.locator('.anchor-pdf-highlight').first().press('Enter');
  await expect(viewer.locator('#anchor-notes-popover textarea')).toHaveValue('PDF research note');
  await viewer.locator('#anchor-notes-popover textarea').fill('Edited PDF note');
  await viewer.getByRole('button', { name: 'Save changes', exact: true }).click();
});

test('captures multiple spans within one page and clearly rejects cross-page selections', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(
    `chrome-extension://${extensionId}/pdf.html?source=${encodeURIComponent('http://127.0.0.1:4173/pdf-document')}`,
  );
  const viewer = page.frameLocator('#pdf-viewer');
  await expect(viewer.locator('.page[data-page-number="1"] .textLayer')).toContainText('A second span');
  await viewer.locator('.page[data-page-number="1"] .textLayer').evaluate((root) => {
    const spans = root.querySelectorAll('span');
    const range = root.ownerDocument.createRange();
    range.setStartBefore(spans[0]!);
    range.setEndAfter(spans[spans.length - 1]!);
    const selection = root.ownerDocument.defaultView!.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.getByRole('button', { name: 'Save highlight', exact: true }).click();
  await expect(viewer.locator('#anchor-notes-composer')).toContainText('A second span');
  await viewer.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(viewer.locator('.anchor-pdf-highlight')).toHaveCount(2);
  await viewer.locator('#pageNumber').fill('2');
  await viewer.locator('#pageNumber').press('Enter');
  await expect(viewer.locator('.page[data-page-number="2"] .textLayer')).toContainText('page two');
  await viewer.locator('#viewer').evaluate((root) => {
    const first = root.querySelector('.page[data-page-number="1"] .textLayer span')!,
      last = root.querySelector('.page[data-page-number="2"] .textLayer span')!;
    const range = root.ownerDocument.createRange();
    range.setStartBefore(first);
    range.setEndAfter(last);
    const selection = root.ownerDocument.defaultView!.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.getByRole('button', { name: 'Save highlight', exact: true }).click();
  await expect(viewer.locator('#anchor-notes-toast')).toContainText('Select text within one PDF page');
  await expect(viewer.locator('#anchor-notes-composer')).toHaveCount(0);
});
