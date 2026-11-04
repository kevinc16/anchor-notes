import path from 'node:path';
import { test, expect } from './fixtures';

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
