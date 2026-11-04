import { parsePdfViewerUrl } from './pdf-navigation';
import type { MessageResponse } from './types';
export interface ViewerPort {
  name: string;
  sender?: { url?: string; tab?: { id?: number }; frameId?: number };
  postMessage(message: unknown): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
}
export type PdfRequest =
  { type: 'CAPTURE_SELECTION' } | { type: 'SCROLL_TO_NOTE'; id: string } | { type: 'GET_PDF_CONTEXT' };
export function createPdfRouter(base: string) {
  const viewers = new Map<number, ViewerPort>();
  const pending = new Map<string, { port: ViewerPort; finish(response: MessageResponse): void }>();
  function connect(port: ViewerPort) {
    const tabId = port.sender?.tab?.id;
    if (
      port.name !== 'anchor-pdf-viewer' ||
      tabId === undefined ||
      (port.sender?.frameId !== undefined && port.sender.frameId !== 0) ||
      !parsePdfViewerUrl(port.sender?.url || '', base)
    )
      return false;
    viewers.set(tabId, port);
    port.onMessage.addListener((message) => {
      if (!message || typeof message !== 'object') return;
      const item = message as { requestId?: unknown; response?: MessageResponse };
      if (typeof item.requestId !== 'string' || typeof item.response?.ok !== 'boolean') return;
      const request = pending.get(item.requestId);
      if (request?.port === port) request.finish(item.response);
    });
    port.onDisconnect.addListener(() => {
      if (viewers.get(tabId) === port) viewers.delete(tabId);
      for (const request of pending.values())
        if (request.port === port) request.finish({ ok: false, error: 'The PDF viewer disconnected. Try again.' });
    });
    return true;
  }
  function send(tabId: number, request: PdfRequest): Promise<MessageResponse> {
    const port = viewers.get(tabId);
    if (!port)
      return Promise.resolve({ ok: false, error: 'The PDF viewer is not ready. Open the PDF in Anchor Notes first.' });
    return new Promise((resolve) => {
      const requestId = crypto.randomUUID();
      const finish = (response: MessageResponse) => {
        clearTimeout(timer);
        pending.delete(requestId);
        resolve(response);
      };
      const timer = setTimeout(() => finish({ ok: false, error: 'The PDF viewer did not respond. Try again.' }), 20000);
      pending.set(requestId, { port, finish });
      try {
        port.postMessage({ requestId, ...request });
      } catch {
        finish({ ok: false, error: 'The PDF viewer is unavailable. Try reopening it.' });
      }
    });
  }
  return { connect, send, has: (tabId: number) => viewers.has(tabId) };
}
