import { browser, defineContentScript } from '#imports';
import { normalizeUrl, readData } from '@/lib/storage';
import type { AnchorNote, ExtensionMessage, HighlightAnchor, MessageResponse } from '@/lib/types';
import './style.css';

const HIGHLIGHT_CLASS = 'anchor-note-highlight';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  cssInjectionMode: 'manifest',
  main() {
    let pendingRange: Range | null = null;

    function textContext(range: Range) {
      const rootText = document.body.innerText || '';
      const quote = range.toString().trim();
      const index = rootText.indexOf(quote);
      return {
        exact: quote,
        prefix: index >= 0 ? rootText.slice(Math.max(0, index - 48), index) : '',
        suffix: index >= 0 ? rootText.slice(index + quote.length, index + quote.length + 48) : '',
      };
    }

    function cssPath(node: Node): string {
      if (node === document.body) return 'body';
      const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
      if (!element) return 'body';
      const parts: string[] = [];
      let current: Element | null = element;
      while (current && current !== document.body && parts.length < 7) {
        let selector = current.tagName.toLowerCase();
        if (current.id) {
          selector += `#${CSS.escape(current.id)}`;
          parts.unshift(selector);
          break;
        }
        const parent: Element | null = current.parentElement;
        const siblings = parent
          ? [...parent.children].filter((item) => item.tagName === current?.tagName)
          : [];
        if (siblings.length > 1) selector += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        parts.unshift(selector);
        current = parent;
      }
      return `body > ${parts.join(' > ')}`;
    }

    function makeAnchor(range: Range): HighlightAnchor {
      return {
        quote: textContext(range),
        startPath: cssPath(range.startContainer),
        startOffset: range.startOffset,
        endPath: cssPath(range.endContainer),
        endOffset: range.endOffset,
      };
    }

    function showComposer() {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        showToast('Select some text first');
        return;
      }

      pendingRange = selection.getRangeAt(0).cloneRange();
      document.getElementById('anchor-notes-composer')?.remove();
      const rect = pendingRange.getBoundingClientRect();
      const composer = document.createElement('div');
      composer.id = 'anchor-notes-composer';
      composer.innerHTML = `
        <div class="anchor-composer-kicker">New highlight</div>
        <div class="anchor-composer-quote"></div>
        <textarea maxlength="2000" placeholder="Why does this matter? (optional)"></textarea>
        <div class="anchor-composer-actions">
          <button class="anchor-cancel" type="button">Cancel</button>
          <button class="anchor-save" type="button">Save note</button>
        </div>`;
      const quote = composer.querySelector<HTMLElement>('.anchor-composer-quote');
      if (quote) quote.textContent = `“${selection.toString().trim()}”`;
      document.body.appendChild(composer);
      const left = Math.max(12, Math.min(window.innerWidth - 352, rect.left));
      const top = Math.max(12, Math.min(window.innerHeight - composer.offsetHeight - 12, rect.bottom + 12));
      Object.assign(composer.style, { left: `${left}px`, top: `${top}px` });
      composer.querySelector<HTMLTextAreaElement>('textarea')?.focus();
      composer.querySelector<HTMLButtonElement>('.anchor-cancel')?.addEventListener('click', () => {
        composer.remove();
        pendingRange = null;
      });
      composer.querySelector<HTMLButtonElement>('.anchor-save')?.addEventListener('click', () => void saveSelection(composer));
    }

    async function saveSelection(composer: HTMLElement) {
      if (!pendingRange) return;
      const settings = (await readData()).settings;
      const note = {
        id: crypto.randomUUID(),
        url: location.href,
        canonicalUrl: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href || location.href,
        title: document.title || location.hostname,
        quote: pendingRange.toString().trim(),
        body: composer.querySelector<HTMLTextAreaElement>('textarea')?.value.trim() ?? '',
        anchor: makeAnchor(pendingRange),
        pageSnapshot: {
          description: document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content || '',
          capturedAt: new Date().toISOString(),
        },
        color: settings.highlightColor,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } satisfies Omit<AnchorNote, 'tags'>;

      const response = await browser.runtime.sendMessage({ type: 'SAVE_NOTE', note } satisfies ExtensionMessage) as MessageResponse;
      if (!response?.ok || !response.note) {
        showToast(response?.error || 'Could not save note');
        return;
      }

      wrapRange(pendingRange, response.note);
      composer.remove();
      pendingRange = null;
      window.getSelection()?.removeAllRanges();
      showToast('Highlight anchored');
    }

    function wrapRange(range: Range, note: AnchorNote): boolean {
      try {
        const mark = document.createElement('mark');
        mark.className = HIGHLIGHT_CLASS;
        mark.dataset.anchorId = note.id;
        mark.dataset.anchorColor = note.color;
        mark.title = note.body || 'Saved in Anchor Notes';
        range.surroundContents(mark);
        return true;
      } catch {
        return false;
      }
    }

    function findTextRange(exact: string, prefix = '', suffix = ''): Range | null {
      if (!exact) return null;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          return node.parentElement?.closest(`script, style, textarea, #anchor-notes-composer, .${HIGHLIGHT_CLASS}`)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT;
        },
      });
      const nodes: Array<{ node: Text; start: number }> = [];
      let text = '';
      let current: Node | null;
      while ((current = walker.nextNode())) {
        const textNode = current as Text;
        nodes.push({ node: textNode, start: text.length });
        text += textNode.nodeValue ?? '';
      }
      const matches: number[] = [];
      let from = 0;
      while ((from = text.indexOf(exact, from)) >= 0) {
        matches.push(from);
        from += exact.length;
      }
      if (!matches.length) return null;
      const start = matches.sort((a, b) => {
        const score = (index: number) =>
          (prefix && text.slice(Math.max(0, index - prefix.length), index).endsWith(prefix) ? 2 : 0)
          + (suffix && text.slice(index + exact.length, index + exact.length + suffix.length).startsWith(suffix) ? 2 : 0);
        return score(b) - score(a);
      })[0];
      if (start === undefined) return null;
      const startEntry = [...nodes].reverse().find((entry) => entry.start <= start);
      const endPosition = start + exact.length;
      const endEntry = [...nodes].reverse().find((entry) => entry.start < endPosition);
      if (!startEntry || !endEntry) return null;
      const range = document.createRange();
      range.setStart(startEntry.node, start - startEntry.start);
      range.setEnd(endEntry.node, endPosition - endEntry.start);
      return range;
    }

    async function restoreHighlights() {
      const current = normalizeUrl(location.href);
      const notes = (await readData()).notes.filter(
        (note) => normalizeUrl(note.url) === current || normalizeUrl(note.canonicalUrl ?? '') === current,
      );
      for (const note of notes) {
        const selector = note.anchor?.quote;
        const range = findTextRange(selector?.exact || note.quote, selector?.prefix, selector?.suffix);
        if (range) wrapRange(range, note);
      }
    }

    function showToast(message: string) {
      document.getElementById('anchor-notes-toast')?.remove();
      const toast = document.createElement('div');
      toast.id = 'anchor-notes-toast';
      toast.textContent = message;
      document.body.appendChild(toast);
      window.setTimeout(() => toast.remove(), 2200);
    }

    browser.runtime.onMessage.addListener((message: ExtensionMessage) => {
      if (message.type === 'CAPTURE_SELECTION') showComposer();
      if (message.type === 'SCROLL_TO_NOTE') {
        document.querySelector<HTMLElement>(`[data-anchor-id="${CSS.escape(message.id)}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return undefined;
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') document.getElementById('anchor-notes-composer')?.remove();
    });
    void restoreHighlights();
  },
});

