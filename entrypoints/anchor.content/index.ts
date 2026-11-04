import { browser, defineContentScript } from '#imports';
import { mountNoteUi } from '@/lib/note-ui';
import { observeHighlightRestoration } from '@/lib/highlight-restoration';
import { readData } from '@/lib/storage';
import type { ExtensionMessage, MessageResponse } from '@/lib/types';
import './style.css';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  cssInjectionMode: 'manifest',
  main(ctx) {
    const ui = mountNoteUi(document);
    const restoration = observeHighlightRestoration(document, readData);
    const onMessage = (message: ExtensionMessage) => {
      if (message.type === 'CAPTURE_SELECTION') void ui.showComposer();
      if (message.type === 'SCROLL_TO_NOTE')
        document
          .querySelector<HTMLElement>(`[data-anchor-id="${CSS.escape(message.id)}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return undefined;
    };
    browser.runtime.onMessage.addListener(onMessage);
    void browser.runtime
      .sendMessage({ type: 'TAKE_NOTE_RETURN' } satisfies ExtensionMessage)
      .then((response: MessageResponse) => {
        if (response?.ok && response.returnIntent) restoration.requestScroll(response.returnIntent);
      })
      .catch(() => undefined);
    ctx.addEventListener(window, 'wxt:locationchange', () => restoration.refresh());
    const onChanged = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && 'anchorNotesData' in changes) restoration.refresh();
    };
    browser.storage.onChanged.addListener(onChanged);
    ctx.onInvalidated(() => {
      ui.stop();
      restoration.stop();
      browser.storage.onChanged.removeListener(onChanged);
      browser.runtime.onMessage.removeListener(onMessage);
    });
  },
});
