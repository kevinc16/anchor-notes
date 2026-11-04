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
  const aligned = () =>
    viewer
      .locator('.anchor-pdf-highlight')
      .first()
      .evaluate((mark) => {
        const text = mark.closest('.page')!.querySelector('.textLayer span')!;
        const range = mark.ownerDocument.createRange();
        range.selectNodeContents(text);
        const expected = range.getBoundingClientRect(),
          actual = mark.getBoundingClientRect();
        return (
          Math.abs(actual.left - expected.left) < 1 &&
          Math.abs(actual.top - expected.top) < 1 &&
          Math.abs(actual.width - expected.width) < 1 &&
          Math.abs(actual.height - expected.height) < 1
        );
      });
  await expect.poll(aligned).toBe(true);
  await viewer.locator('#secondaryToolbarToggleButton').click();
  await viewer.locator('#pageRotateCw').click();
  await viewer.locator('#secondaryToolbarToggleButton').click();
  await expect.poll(aligned).toBe(true);
  await viewer.locator('.anchor-pdf-highlight').first().press('Enter');
  await expect(viewer.locator('#anchor-notes-popover textarea')).toHaveValue('PDF research note');
  await viewer.locator('#anchor-notes-popover textarea').fill('Edited PDF note');
  await viewer.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(async () => (await readExtensionData(serviceWorker)).notes[0]?.body).toBe('Edited PDF note');
  await expect(viewer.locator('#anchor-notes-popover')).toHaveCount(0);
  await viewer.locator('.anchor-pdf-highlight').first().press('Enter');
  await viewer.getByRole('button', { name: 'Use mint highlight' }).click();
  await expect.poll(async () => (await readExtensionData(serviceWorker)).notes[0]?.color).toBe('mint');
  await viewer.getByRole('button', { name: 'Delete', exact: true }).click();
  await viewer.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(viewer.locator('.anchor-pdf-highlight')).toHaveCount(0);
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

test('popup matches the original PDF and library links reopen the exact saved highlight', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const { openPopupInInactiveTab } = await import('./fixtures');
  const page = await context.newPage();
  await page.goto(
    `chrome-extension://${extensionId}/pdf.html?source=${encodeURIComponent('http://127.0.0.1:4173/pdf-document')}`,
  );
  const viewer = page.frameLocator('#pdf-viewer');
  await expect(page.getByRole('status')).toContainText('PDF opened');
  await viewer.locator('#pageNumber').fill('3');
  await viewer.locator('#pageNumber').press('Enter');
  const text = viewer.locator('.page[data-page-number="3"] .textLayer span').filter({ hasText: 'Final page' }).first();
  await text.evaluate((node) => {
    const range = node.ownerDocument.createRange();
    range.selectNodeContents(node);
    const selection = node.ownerDocument.defaultView!.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.getByRole('button', { name: 'Save highlight', exact: true }).click();
  await viewer.locator('#anchor-notes-composer textarea').fill('Source-linked PDF note');
  await viewer.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(viewer.locator('.anchor-pdf-highlight').first()).toBeVisible();
  await page.getByRole('button', { name: 'Keep PDF on this device', exact: true }).click();
  await expect(page.getByRole('button', { name: 'PDF kept on this device' })).toBeVisible();
  await page.bringToFront();
  const popup = await openPopupInInactiveTab(context, extensionId, serviceWorker);
  await expect(popup.getByText('Source-linked PDF note', { exact: true })).toBeVisible();
  const liveContext = await popup.evaluate(async () => {
    const api = (
      globalThis as unknown as {
        chrome: {
          tabs: { query(query: unknown): Promise<Array<{ id?: number }>> };
          runtime: { sendMessage(message: unknown): Promise<unknown> };
        };
      }
    ).chrome;
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    return api.runtime.sendMessage({ type: 'GET_PDF_CONTEXT', tabId: tab!.id });
  });
  expect(liveContext).toMatchObject({ ok: true, pdfContext: { url: 'http://127.0.0.1:4173/pdf-document' } });
  await viewer.locator('#pageNumber').fill('1');
  await viewer.locator('#pageNumber').press('Enter');
  await popup.getByRole('button', { name: 'Show on page', exact: true }).click();
  await expect(viewer.locator('#pageNumber')).toHaveValue('3');
  await expect(viewer.locator('.anchor-pdf-highlight').first()).toBeVisible();
  const library = await context.newPage();
  await library.goto(`chrome-extension://${extensionId}/options.html`);
  const link = library.getByRole('link', { name: 'Return to source' }).first();
  await expect(link).toHaveAttribute('href', /pdf\.html\?.*note=/);
  await context.setOffline(true);
  const [reopened] = await Promise.all([context.waitForEvent('page'), link.click()]);
  await expect(reopened.frameLocator('#pdf-viewer').locator('.anchor-pdf-highlight').first()).toBeVisible();
  await context.setOffline(false);
  await page.route('**/pdf-document', (route) =>
    route.fulfill({ path: path.resolve('tests/e2e/fixtures/second.pdf'), contentType: 'application/pdf' }),
  );
  await page.getByLabel('PDF URL').fill('http://127.0.0.1:4173/pdf-document');
  await page.getByRole('button', { name: 'Open PDF', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('different version');
  await page.bringToFront();
  const olderPopup = await openPopupInInactiveTab(context, extensionId, serviceWorker);
  await expect(olderPopup.getByText('Source-linked PDF note', { exact: true })).toBeVisible();
  const [older] = await Promise.all([
    context.waitForEvent('page'),
    olderPopup.getByRole('button', { name: 'Show on page', exact: true }).click(),
  ]);
  await expect(older.frameLocator('#pdf-viewer').locator('.anchor-pdf-highlight').first()).toBeVisible();
});

test('a saved remote note reconnects to matching local bytes after URL failure', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const { createHash } = await import('node:crypto');
  const { readFileSync } = await import('node:fs');
  const { DEFAULT_SETTINGS } = await import('../../lib/settings');
  const hash = createHash('sha256')
    .update(readFileSync(path.resolve('tests/e2e/fixtures/research.pdf')))
    .digest('hex');
  const quote = 'Anchor PDF research on page one.';
  const source = 'http://127.0.0.1:4173/unavailable-pdf';
  const note = {
    id: 'fallback-pdf-note',
    url: source,
    title: 'Remote research',
    quote,
    body: 'Retained remote identity',
    anchor: {
      quote: { exact: quote, prefix: '', suffix: '' },
      startPath: '',
      startOffset: 0,
      endPath: '',
      endOffset: 0,
      pdf: { version: 1 as const, pageNumber: 1, documentHash: hash, start: 0, end: quote.length },
    },
    pageSnapshot: { description: '', capturedAt: '2026-01-01' },
    color: 'yellow' as const,
    tags: [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };
  await seedExtensionData(serviceWorker, { schemaVersion: 1, notes: [note], settings: DEFAULT_SETTINGS });
  const page = await context.newPage();
  await page.goto(
    `chrome-extension://${extensionId}/pdf.html?source=${encodeURIComponent(source)}&note=${note.id}&document=${hash}`,
  );
  await expect(page.getByRole('status')).toContainText('could not be downloaded');
  await page.getByLabel('Choose PDF file').setInputFiles(path.resolve('tests/e2e/fixtures/second.pdf'));
  await expect(page.getByRole('status')).toContainText('different PDF');
  await page.getByLabel('Choose PDF file').setInputFiles(path.resolve('tests/e2e/fixtures/research.pdf'));
  await expect(page.frameLocator('#pdf-viewer').locator('.anchor-pdf-highlight').first()).toBeVisible();
  expect(new URL(page.url()).searchParams.get('source')).toBe(source);
  await page.getByLabel('Choose PDF file').setInputFiles(path.resolve('tests/e2e/fixtures/second.pdf'));
  await expect(page).toHaveTitle('second.pdf — Anchor Notes');
  expect(new URL(page.url()).searchParams.has('note')).toBe(false);
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Choose the same PDF');
});

test('kept PDFs survive a persistent browser-context restart without a source request', async () => {
  test.setTimeout(60_000);
  const { chromium } = await import('@playwright/test');
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const profile = await mkdtemp(path.join(tmpdir(), 'anchor-pdf-retained-'));
  const extension = path.resolve('.output/chrome-mv3');
  const launch = () =>
    chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
  let context = await launch();
  try {
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    const id = new URL(worker.url()).hostname;
    let page = await context.newPage();
    await page.goto(`chrome-extension://${id}/pdf.html`);
    await page.getByLabel('Choose PDF file').setInputFiles(path.resolve('tests/e2e/fixtures/research.pdf'));
    await expect(page.getByRole('status')).toContainText('PDF opened');
    await page.getByRole('button', { name: 'Keep PDF on this device', exact: true }).click();
    await expect(page.getByRole('button', { name: 'PDF kept on this device' })).toBeVisible();
    const url = page.url();
    await context.close();
    context = await launch();
    await context.setOffline(true);
    page = await context.newPage();
    await page.goto(url);
    await expect(page.getByRole('status')).toContainText('Saved PDF opened');
    await expect(page.frameLocator('#pdf-viewer').locator('.textLayer').first()).toContainText('Anchor PDF research');
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
