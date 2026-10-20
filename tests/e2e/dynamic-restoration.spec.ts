import { DEFAULT_SETTINGS } from '../../lib/settings';
import type { AnchorNote } from '../../lib/types';
import { expect, resetExtensionStorage, seedExtensionData, test } from './fixtures';

const PASSAGE = 'Anchor Notes keeps important ideas attached to the page, even when its markup changes.';

function makeNote(url: string, id = 'dynamic', quote = PASSAGE): AnchorNote {
  const now = new Date().toISOString();
  return {
    id,
    url,
    canonicalUrl: url,
    title: 'Dynamic restoration fixture',
    quote,
    body: '',
    color: 'mint',
    tags: [],
    anchor: {
      quote: { exact: quote, prefix: '', suffix: '' },
      startPath: 'body',
      startOffset: 0,
      endPath: 'body',
      endOffset: quote.length,
    },
    pageSnapshot: { description: '', capturedAt: now },
    createdAt: now,
    updatedAt: now,
  };
}

test.beforeEach(async ({ serviceWorker }) => resetExtensionStorage(serviceWorker));

test('restores late text, text-node changes, and virtualized content', async ({ page, serviceWorker, articleUrl }) => {
  const quote = 'This synthetic quote arrives after initial restoration.';
  await seedExtensionData(serviceWorker, {
    schemaVersion: 1,
    settings: DEFAULT_SETTINGS,
    notes: [makeNote(articleUrl, 'late', quote)],
  });
  await page.goto(articleUrl, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const p = document.createElement('p');
    p.id = 'late';
    p.textContent = 'Loading…';
    document.body.append(p);
  });
  const marks = page.locator('mark[data-anchor-id="late"]');
  await expect(marks).toHaveCount(0);
  await page.locator('#late').evaluate((p, text) => {
    p.firstChild!.nodeValue = text;
  }, quote);
  await expect(marks).toHaveCount(1);
  await page.locator('#late').evaluate((p) => p.remove());
  await expect(marks).toHaveCount(0);
  await page.evaluate((text) => {
    const p = document.createElement('p');
    p.textContent = text;
    document.body.append(p);
  }, quote);
  await expect(marks).toHaveCount(1);
});

test('repairs partial and full rerenders without highlighting another occurrence', async ({
  page,
  serviceWorker,
  articleUrl,
}) => {
  await seedExtensionData(serviceWorker, {
    schemaVersion: 1,
    settings: DEFAULT_SETTINGS,
    notes: [makeNote(articleUrl)],
  });
  await page.goto(articleUrl, { waitUntil: 'networkidle' });
  const marks = page.locator('mark[data-anchor-id="dynamic"]');
  await expect(marks).toHaveCount(3);
  await page.locator('#passage strong').evaluate((strong) => {
    strong.textContent = 'important ideas';
  });
  await expect(marks).toHaveCount(3);
  await page.locator('#passage').evaluate((p, text) => {
    p.textContent = text;
  }, PASSAGE);
  await expect(marks).toHaveCount(1);
  const originalMark = await marks.elementHandle();
  await page.evaluate((text) => {
    const p = document.createElement('p');
    p.id = 'duplicate';
    p.textContent = text;
    document.body.append(p);
    for (let i = 0; i < 100; i++) document.body.append(document.createElement('aside'));
  }, PASSAGE);
  // Wait beyond multiple coordinator cycles to catch duplicate restoration and observer loops.
  await page.waitForTimeout(600);
  await expect(marks).toHaveCount(1);
  await expect(page.locator('#duplicate mark')).toHaveCount(0);
  expect(await originalMark!.evaluate((mark) => mark.isConnected)).toBe(true);
});

test('restores pushState, replaceState, and back/forward destinations and clears old marks', async ({
  page,
  serviceWorker,
  articleUrl,
}) => {
  const secondUrl = `${articleUrl}/second`;
  const thirdUrl = `${articleUrl}/third`;
  await seedExtensionData(serviceWorker, {
    schemaVersion: 1,
    settings: DEFAULT_SETTINGS,
    notes: [makeNote(articleUrl, 'first'), makeNote(secondUrl, 'second'), makeNote(thirdUrl, 'third')],
  });
  await page.goto(articleUrl, { waitUntil: 'networkidle' });
  const marks = page.locator('mark.anchor-note-highlight');
  const expectRoute = async (id: string) => {
    await expect(marks).toHaveCount(3);
    await expect
      .poll(() =>
        marks.evaluateAll((items) => [...new Set(items.map((mark) => (mark as HTMLElement).dataset.anchorId))]),
      )
      .toEqual([id]);
  };
  await expectRoute('first');
  // Leave the original canonical link unchanged to exercise stale SPA metadata.
  await page.evaluate((url) => history.pushState({}, '', url), secondUrl);
  await expectRoute('second');
  await page.evaluate((url) => history.replaceState({}, '', url), thirdUrl);
  await expectRoute('third');
  await page.evaluate(() => history.back());
  await expectRoute('first');
  await page.evaluate(() => history.forward());
  await expectRoute('third');
});

test('matches a canonical URL and reacts when canonical metadata changes', async ({
  page,
  serviceWorker,
  articleUrl,
}) => {
  await seedExtensionData(serviceWorker, {
    schemaVersion: 1,
    settings: DEFAULT_SETTINGS,
    notes: [makeNote(articleUrl)],
  });
  await page.goto(`${articleUrl}?variant=1`, { waitUntil: 'networkidle' });
  const marks = page.locator('mark[data-anchor-id="dynamic"]');
  await expect(marks).toHaveCount(3);
  await page.locator('link[rel="canonical"]').evaluate((link) => {
    (link as HTMLLinkElement).href = '/different';
  });
  await expect(marks).toHaveCount(0);
  await page.locator('link[rel="canonical"]').evaluate((link, url) => {
    (link as HTMLLinkElement).href = url;
  }, articleUrl);
  await expect(marks).toHaveCount(3);
});
