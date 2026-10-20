import { chromium, test as base, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import path from 'node:path';
import type { AnchorData } from '../../lib/types';

const pathToExtension = path.resolve(process.cwd(), '.output/chrome-mv3');
const articleHtml = readFileSync(path.resolve(process.cwd(), 'tests/e2e/fixtures/article.html'), 'utf8');

export const ARTICLE_URL = 'http://127.0.0.1:4173/article';

interface StorageArea {
  clear(): Promise<void>;
  get(keys?: string | string[]): Promise<Record<string, unknown>>;
  remove(keys: string | string[]): Promise<void>;
  set(items: Record<string, unknown>): Promise<void>;
}

interface ChromeExtensionApi {
  storage: {
    local: StorageArea;
    session: StorageArea;
  };
  tabs: {
    create(createProperties: { active?: boolean; url: string }): Promise<{ id?: number }>;
    query(queryInfo: { active?: boolean; currentWindow?: boolean }): Promise<Array<{ id?: number }>>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
    update(tabId: number, updateProperties: { active?: boolean }): Promise<unknown>;
  };
}

type Fixtures = {
  context: BrowserContext;
  extensionId: string;
  serviceWorker: Worker;
  articleUrl: string;
};

type WorkerFixtures = {
  fixtureServer: void;
};

export const test = base.extend<Fixtures, WorkerFixtures>({
  fixtureServer: [
    async ({}, use) => {
      const pendingCompletions = new Map<string, ServerResponse[]>();
      const server = createServer((request, response) => {
        const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
        const pathname = url.pathname;

        if (pathname === '/release-completion') {
          const key = url.searchParams.get('hold') ?? '';
          const queue = pendingCompletions.get(key);
          const pending = queue?.shift();
          if (!queue?.length) pendingCompletions.delete(key);
          if (pending) {
            const result = url.searchParams.get('result');
            pending.writeHead(result === 'error' ? 503 : 200, {
              'access-control-allow-origin': '*',
              'content-type': 'application/json',
            });
            pending.end(
              JSON.stringify({
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        tags: ['e2e', 'ai'],
                        summary: 'Organized by the local E2E provider.',
                      }),
                    },
                  },
                ],
              }),
            );
          }
          response.writeHead(pending ? 200 : 404);
          response.end();
          return;
        }

        if (pathname === '/v1/chat/completions') {
          const corsHeaders = {
            'access-control-allow-headers': 'Content-Type, Authorization',
            'access-control-allow-methods': 'POST, OPTIONS',
            'access-control-allow-origin': '*',
          };
          if (request.method === 'OPTIONS') {
            response.writeHead(204, corsHeaders);
            response.end();
            return;
          }
          if (request.method === 'POST') {
            const hold = url.searchParams.get('hold');
            if (hold) {
              pendingCompletions.set(hold, [...(pendingCompletions.get(hold) ?? []), response]);
              response.once('close', () => {
                const remaining = pendingCompletions.get(hold)?.filter((item) => item !== response);
                if (remaining?.length) pendingCompletions.set(hold, remaining);
                else pendingCompletions.delete(hold);
              });
              return;
            }
            response.writeHead(200, { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' });
            response.end(
              JSON.stringify({
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        tags: ['e2e', 'ai'],
                        summary: 'Organized by the local E2E provider.',
                      }),
                    },
                  },
                ],
              }),
            );
            return;
          }
        }

        if (pathname === '/' || pathname === '/article') {
          response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          response.end(articleHtml);
          return;
        }

        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
      });

      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(4173, '127.0.0.1', () => resolve());
      });

      try {
        await use();
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
    { scope: 'worker', auto: true },
  ],

  context: async ({ headless }, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless,
      args: [`--disable-extensions-except=${pathToExtension}`, `--load-extension=${pathToExtension}`],
    });

    try {
      await use(context);
    } finally {
      await context.close();
    }
  },

  serviceWorker: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) serviceWorker = await context.waitForEvent('serviceworker');
    await use(serviceWorker);
  },

  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).hostname);
  },

  articleUrl: async ({ fixtureServer: _fixtureServer }, use) => {
    await use(ARTICLE_URL);
  },
});

export const expect = test.expect;

export async function resetExtensionStorage(serviceWorker: Worker): Promise<void> {
  await serviceWorker.evaluate(async () => {
    const chromeApi = (globalThis as unknown as { chrome: ChromeExtensionApi }).chrome;
    await chromeApi.storage.local.clear();
    await chromeApi.storage.session.clear();
  });
}

export async function seedExtensionData(serviceWorker: Worker, data: AnchorData, sessionApiKey = ''): Promise<void> {
  await serviceWorker.evaluate(
    async ({ data: nextData, sessionApiKey: nextSessionApiKey }: { data: AnchorData; sessionApiKey: string }) => {
      const chromeApi = (globalThis as unknown as { chrome: ChromeExtensionApi }).chrome;
      await chromeApi.storage.local.set({ anchorNotesData: nextData });
      if (nextSessionApiKey) {
        await chromeApi.storage.session.set({ anchorNotesAiApiKey: nextSessionApiKey });
      } else {
        await chromeApi.storage.session.remove('anchorNotesAiApiKey');
      }
    },
    { data, sessionApiKey },
  );
}

export async function readExtensionData(serviceWorker: Worker): Promise<AnchorData> {
  return serviceWorker.evaluate(async () => {
    const chromeApi = (globalThis as unknown as { chrome: ChromeExtensionApi }).chrome;
    const result = await chromeApi.storage.local.get('anchorNotesData');
    return result.anchorNotesData as AnchorData;
  });
}

export async function readSessionApiKey(serviceWorker: Worker): Promise<string> {
  return serviceWorker.evaluate(async () => {
    const chromeApi = (globalThis as unknown as { chrome: ChromeExtensionApi }).chrome;
    const result = await chromeApi.storage.session.get('anchorNotesAiApiKey');
    return typeof result.anchorNotesAiApiKey === 'string' ? result.anchorNotesAiApiKey : '';
  });
}

export async function triggerCaptureSelection(serviceWorker: Worker): Promise<void> {
  await serviceWorker.evaluate(async () => {
    const chromeApi = (globalThis as unknown as { chrome: ChromeExtensionApi }).chrome;
    const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('Could not find the active fixture tab.');
    await chromeApi.tabs.sendMessage(tab.id, { type: 'CAPTURE_SELECTION' });
  });
}

export async function openExtensionPage(
  context: BrowserContext,
  extensionId: string,
  pageName: 'options.html' | 'popup.html',
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${pageName}`, { waitUntil: 'networkidle' });
  return page;
}

export async function openPopupInInactiveTab(
  context: BrowserContext,
  extensionId: string,
  serviceWorker: Worker,
): Promise<Page> {
  const popupUrl = `chrome-extension://${extensionId}/popup.html`;
  const [popupPage] = await Promise.all([
    context.waitForEvent('page'),
    serviceWorker.evaluate(async (url) => {
      const chromeApi = (globalThis as unknown as { chrome: ChromeExtensionApi }).chrome;
      const [activeTab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
      const tab = await chromeApi.tabs.create({ active: false, url });
      if (!tab.id) throw new Error('Could not open the popup test tab.');
      if (activeTab?.id !== undefined) await chromeApi.tabs.update(activeTab.id, { active: true });
    }, popupUrl),
  ]);
  await popupPage.waitForLoadState('networkidle');
  await popupPage.reload({ waitUntil: 'networkidle' });
  return popupPage;
}
