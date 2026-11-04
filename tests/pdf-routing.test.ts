import { expect, it } from 'vitest';
import { createPdfRouter, type ViewerPort } from '../lib/pdf-routing';
function port(tabId: number, url = 'chrome-extension://synthetic/pdf.html') {
  const messages: Array<{ requestId: string; type: string }> = [];
  let receive: (message: unknown) => void = () => undefined,
    disconnect: () => void = () => undefined;
  const value: ViewerPort = {
    name: 'anchor-pdf-viewer',
    sender: { tab: { id: tabId }, url, frameId: 0 },
    postMessage(message) {
      messages.push(message as (typeof messages)[number]);
    },
    onMessage: {
      addListener(listener) {
        receive = listener;
      },
    },
    onDisconnect: {
      addListener(listener) {
        disconnect = listener;
      },
    },
  };
  return { value, messages, receive: (message: unknown) => receive(message), disconnect: () => disconnect() };
}
it('routes capture to only its target tab and ignores responses from another viewer', async () => {
  const router = createPdfRouter('chrome-extension://synthetic/'),
    a = port(1),
    b = port(2);
  router.connect(a.value);
  router.connect(b.value);
  const response = router.send(1, { type: 'CAPTURE_SELECTION' });
  expect(a.messages).toHaveLength(1);
  expect(b.messages).toHaveLength(0);
  b.receive({ requestId: a.messages[0]!.requestId, response: { ok: false } });
  a.receive({ requestId: a.messages[0]!.requestId, response: { ok: true } });
  expect((await response).ok).toBe(true);
});
it('rejects foreign senders and tolerates reconnect followed by old-port disconnect', async () => {
  const router = createPdfRouter('chrome-extension://synthetic/'),
    old = port(1),
    fresh = port(1);
  expect(router.connect(port(2, 'https://example.test/pdf.html').value)).toBe(false);
  router.connect(old.value);
  router.connect(fresh.value);
  old.disconnect();
  expect(router.has(1)).toBe(true);
  const pending = router.send(1, { type: 'GET_PDF_CONTEXT' });
  fresh.disconnect();
  expect((await pending).ok).toBe(false);
  expect((await router.send(99, { type: 'CAPTURE_SELECTION' })).ok).toBe(false);
});
