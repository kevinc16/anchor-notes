import { browser } from '#imports';
import type { LoadedPdf } from './main';
import type { MessageResponse } from '@/lib/types';

export function connectPdfViewer(
  ui: Promise<{ showComposer(): Promise<void>; showNote(id: string): Promise<boolean> }>,
  current: () => LoadedPdf | undefined,
) {
  let stopped = false;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  let port: ReturnType<typeof browser.runtime.connect>;
  function connect() {
    if (stopped) return;
    port = browser.runtime.connect({ name: 'anchor-pdf-viewer' });
    port.onMessage.addListener((request: { requestId?: string; type?: string; id?: string }) => {
      if (!request.requestId) return;
      const handle = async (): Promise<MessageResponse> => {
        const pdf = current();
        if (!pdf) return { ok: false, error: 'Open a PDF first.' };
        if (request.type === 'GET_PDF_CONTEXT')
          return { ok: true, pdfContext: { url: pdf.url, title: pdf.title, documentHash: pdf.documentHash } };
        const controls = await ui;
        if (request.type === 'CAPTURE_SELECTION') {
          await controls.showComposer();
          return { ok: true };
        }
        if (request.type === 'SCROLL_TO_NOTE' && request.id) return { ok: await controls.showNote(request.id) };
        return { ok: false, error: 'Unknown PDF command.' };
      };
      const recipient = port;
      void handle()
        .catch(() => ({ ok: false, error: 'Could not complete PDF command.' }))
        .then((response) => {
          try {
            recipient.postMessage({ requestId: request.requestId, response });
          } catch {
            /* Page/background closed. */
          }
        });
    });
    port.onDisconnect.addListener(() => {
      if (!stopped) reconnect = setTimeout(connect, 500);
    });
  }
  connect();
  window.addEventListener(
    'pagehide',
    () => {
      stopped = true;
      if (reconnect) clearTimeout(reconnect);
      port.disconnect();
    },
    { once: true },
  );
}
