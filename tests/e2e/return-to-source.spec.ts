import { DEFAULT_SETTINGS } from '../../lib/settings';
import type { AnchorNote } from '../../lib/types';
import { expect, resetExtensionStorage, seedExtensionData, test } from './fixtures';

const QUOTE = 'Target passage split across elements.';
const TARGET = '<p id="target" style="margin-top:2000px">Target <strong>passage</strong> split across elements.</p>';

function note(id: string, url: string, quote = QUOTE): AnchorNote {
  return {
    id,
    url,
    title: 'Return fixture',
    quote,
    body: id,
    color: 'mint',
    tags: [],
    anchor: {
      quote: { exact: quote, prefix: '', suffix: '' },
      startPath: 'body',
      endPath: 'body',
      startOffset: 0,
      endOffset: quote.length,
    },
    pageSnapshot: { description: '', capturedAt: '2026-10-20T00:00:00Z' },
    createdAt: '2026-10-20T00:00:00Z',
    updatedAt: '2026-10-20T00:00:00Z',
  };
}

test.beforeEach(async ({ serviceWorker }) => resetExtensionStorage(serviceWorker));

for (const delayed of [false, true]) {
  test(`returns in a new tab and scrolls once to ${delayed ? 'a late-loaded' : 'an existing'} highlight`, async ({
    context,
    page,
    serviceWorker,
    extensionId,
    articleUrl,
  }) => {
    const url = `${articleUrl}?return-source=${delayed ? 'late' : 'static'}#original`;
    await context.route('**/article?return-source=*', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<html><body><p>Unrelated saved passage.</p><main>${delayed ? '' : TARGET}</main><footer style="height:2000px"></footer></body></html>`,
      }),
    );
    await seedExtensionData(serviceWorker, {
      schemaVersion: 1,
      settings: DEFAULT_SETTINGS,
      notes: [note('target-note', url), note('other-note', url, 'Unrelated saved passage.')],
    });
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    // Observe completion before the source tab opens, including fast/static restores.
    await context.addInitScript(() => {
      document.addEventListener(
        'scrollend',
        () => {
          document.documentElement.dataset.returnScrollEnded = 'true';
        },
        { once: true },
      );
    });
    const newTab = context.waitForEvent('page');
    const card = page.locator('article').filter({ hasText: 'target-note' });
    await expect(card.getByRole('heading', { name: 'Return fixture', exact: true })).toBeVisible();
    const sourceLink = card.getByRole('link', { name: 'Return to source' });
    await sourceLink.focus();
    await expect(sourceLink).toBeFocused();
    await page.keyboard.press('Enter');
    const source = await newTab;
    await source.waitForURL(url);
    expect(page.url()).toContain('options.html');
    expect(source.url()).toBe(url);
    const target = source.locator('mark[data-anchor-id="target-note"]').first();
    if (delayed) {
      await expect(source.locator('mark[data-anchor-id="other-note"]')).toHaveCount(1);
      expect(await source.evaluate(() => window.scrollY)).toBe(0);
      await source.locator('main').evaluate((main, html) => {
        main.innerHTML = html;
      }, TARGET);
    }
    await expect(target).toBeInViewport();
    await expect
      .poll(() =>
        target.evaluate((mark) => {
          const rect = mark.getBoundingClientRect();
          return Math.abs(rect.top + rect.height / 2 - innerHeight / 2);
        }),
      )
      .toBeLessThan(40);

    // Being near the center does not mean the smooth scroll has finished.
    await expect(source.locator('html')).toHaveAttribute('data-return-scroll-ended', 'true');
    await source.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await source.locator('main').evaluate((main, html) => {
      main.innerHTML = html;
    }, TARGET);
    await expect(target).toHaveCount(1);
    expect(await source.evaluate(() => window.scrollY)).toBe(0);
    await source.reload();
    await expect(source.locator('mark[data-anchor-id="other-note"]')).toHaveCount(1);
    expect(await source.evaluate(() => window.scrollY)).toBe(0);

    const ordinary = await context.newPage();
    await ordinary.goto(url);
    await expect(ordinary.locator('mark[data-anchor-id="other-note"]')).toHaveCount(1);
    expect(await ordinary.evaluate(() => window.scrollY)).toBe(0);
  });
}

test('still opens the source without errors when the saved passage is missing', async ({
  context,
  page,
  serviceWorker,
  extensionId,
  articleUrl,
}) => {
  const url = `${articleUrl}?return-source=missing`;
  await seedExtensionData(serviceWorker, {
    schemaVersion: 1,
    settings: DEFAULT_SETTINGS,
    notes: [note('missing-note', url)],
  });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  const errors: string[] = [];
  context.on('weberror', (error) => errors.push(error.error().message));
  const newTab = context.waitForEvent('page');
  await page.getByRole('link', { name: 'Return to source' }).click();
  const source = await newTab;
  await source.waitForURL(url);
  await expect(source.locator('#passage')).toBeVisible();
  expect(await source.locator('mark.anchor-note-highlight').count()).toBe(0);
  expect(await source.evaluate(() => window.scrollY)).toBe(0);
  expect(errors).toEqual([]);
});
