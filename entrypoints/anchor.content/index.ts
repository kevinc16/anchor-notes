import { browser, defineContentScript } from '#imports';
import { HIGHLIGHT_CLASS, wrapHighlightRange } from '@/lib/highlight-dom';
import { populateCurrentNote } from '@/lib/note-editor';
import { normalizeUrl, readData } from '@/lib/storage';
import { parseTags } from '@/lib/tags';
import type {
  AnchorNote,
  ExtensionMessage,
  HighlightAnchor,
  HighlightColor,
  MessageResponse,
} from '@/lib/types';
import './style.css';

const COLORS: HighlightColor[] = ['yellow', 'mint', 'lilac', 'coral'];

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

    function renderColorPicker(
      container: HTMLElement,
      selected: HighlightColor,
      onSelect: (color: HighlightColor) => void,
    ) {
      container.replaceChildren();
      for (const color of COLORS) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'anchor-color-swatch';
        button.dataset.color = color;
        button.title = `${color[0]?.toUpperCase()}${color.slice(1)}`;
        button.setAttribute('aria-label', `Use ${color} highlight`);
        button.setAttribute('aria-pressed', String(color === selected));
        button.addEventListener('click', () => onSelect(color));
        container.appendChild(button);
      }
    }

    async function showComposer() {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        showToast('Select some text first');
        return;
      }

      pendingRange = selection.getRangeAt(0).cloneRange();
      const quoteText = pendingRange.toString().trim();
      const { settings } = await readData();
      document.getElementById('anchor-notes-composer')?.remove();
      document.getElementById('anchor-notes-popover')?.remove();
      const rect = pendingRange.getBoundingClientRect();
      const composer = document.createElement('div');
      composer.id = 'anchor-notes-composer';
      composer.dataset.color = settings.highlightColor;
      composer.innerHTML = `
        <div class="anchor-composer-kicker">New highlight</div>
        <div class="anchor-composer-quote"></div>
        <textarea maxlength="2000" placeholder="Why does this matter? (optional)"></textarea>
        <div class="anchor-color-row">
          <span>Highlight color</span>
          <div class="anchor-color-picker" role="group" aria-label="Highlight color"></div>
        </div>
        <div class="anchor-composer-actions">
          <button class="anchor-cancel" type="button">Cancel</button>
          <button class="anchor-save" type="button">Save note</button>
        </div>`;
      const quote = composer.querySelector<HTMLElement>('.anchor-composer-quote');
      if (quote) quote.textContent = `“${quoteText}”`;
      const colorPicker = composer.querySelector<HTMLElement>('.anchor-color-picker');
      if (colorPicker) {
        const selectComposerColor = (color: HighlightColor) => {
          composer.dataset.color = color;
          renderColorPicker(colorPicker, color, selectComposerColor);
        };
        renderColorPicker(colorPicker, settings.highlightColor, selectComposerColor);
      }
      document.body.appendChild(composer);
      positionFloatingElement(composer, rect);
      composer.querySelector<HTMLTextAreaElement>('textarea')?.focus();
      composer.querySelector<HTMLButtonElement>('.anchor-cancel')?.addEventListener('click', () => {
        composer.remove();
        pendingRange = null;
      });
      composer.querySelector<HTMLButtonElement>('.anchor-save')?.addEventListener('click', () => void saveSelection(composer));
    }

    async function saveSelection(composer: HTMLElement) {
      if (!pendingRange) return;
      const now = new Date().toISOString();
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
          capturedAt: now,
        },
        color: (composer.dataset.color || 'yellow') as HighlightColor,
        createdAt: now,
        updatedAt: now,
      } satisfies Omit<AnchorNote, 'tags'>;

      composer.remove();
      const selector = note.anchor.quote;
      const liveRange = findTextRange(selector.exact, selector.prefix, selector.suffix);
      const { settings } = await readData();
      let highlighted = liveRange ? wrapHighlightRange(liveRange, note, settings.highlightCoverage) : false;
      pendingRange = null;
      window.getSelection()?.removeAllRanges();

      const response = await browser.runtime.sendMessage({ type: 'SAVE_NOTE', note } satisfies ExtensionMessage) as MessageResponse;
      if (!response?.ok || !response.note) {
        removeHighlightMarks(note.id);
        showToast(response?.error || 'Could not save note');
        return;
      }

      if (!highlighted) {
        const savedSelector = response.note.anchor.quote;
        const savedRange = findTextRange(savedSelector.exact, savedSelector.prefix, savedSelector.suffix);
        highlighted = savedRange ? wrapHighlightRange(savedRange, response.note, settings.highlightCoverage) : false;
      }
      showToast(highlighted ? 'Highlight anchored' : 'Note saved — reload to restore highlight');
    }

    function removeHighlightMarks(id: string) {
      const parents = new Set<Node>();
      document.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_CLASS}[data-anchor-id="${CSS.escape(id)}"]`).forEach((mark) => {
        if (mark.parentNode) parents.add(mark.parentNode);
        mark.replaceWith(...mark.childNodes);
      });
      parents.forEach((parent) => parent.normalize());
    }

    function findTextRange(exact: string, prefix = '', suffix = ''): Range | null {
      if (!exact) return null;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          return node.parentElement?.closest(`script, style, textarea, #anchor-notes-composer, #anchor-notes-popover, .${HIGHLIGHT_CLASS}`)
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
      const data = await readData();
      const notes = data.notes.filter(
        (note) => normalizeUrl(note.url) === current || normalizeUrl(note.canonicalUrl ?? '') === current,
      );
      for (const note of notes) {
        const selector = note.anchor?.quote;
        const range = findTextRange(selector?.exact || note.quote, selector?.prefix, selector?.suffix);
        if (range) wrapHighlightRange(range, note, data.settings.highlightCoverage);
      }
    }

    function positionFloatingElement(element: HTMLElement, rect: DOMRect) {
      const left = Math.max(12, Math.min(window.innerWidth - element.offsetWidth - 12, rect.left));
      const below = rect.bottom + 12;
      const top = below + element.offsetHeight <= window.innerHeight - 12
        ? below
        : Math.max(12, rect.top - element.offsetHeight - 12);
      Object.assign(element.style, { left: `${left}px`, top: `${top}px` });
    }

    function applyColorToMarks(id: string, color: HighlightColor) {
      document.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_CLASS}[data-anchor-id="${CSS.escape(id)}"]`).forEach((mark) => {
        mark.dataset.anchorColor = color;
      });
    }

    async function updateNote(note: AnchorNote): Promise<AnchorNote | null> {
      const response = await browser.runtime.sendMessage({ type: 'UPDATE_NOTE', note } satisfies ExtensionMessage) as MessageResponse;
      if (!response.ok || !response.note) {
        showToast(response.error || 'Could not update note');
        return null;
      }
      return response.note;
    }

    async function getSavedNote(id: string): Promise<AnchorNote | null> {
      try {
        const response = await browser.runtime.sendMessage({ type: 'GET_NOTE', id } satisfies ExtensionMessage) as MessageResponse;
        if (!response?.ok || !response.note) {
          showToast(response?.error || 'Could not load the saved note');
          return null;
        }
        return response.note;
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Could not load the saved note');
        return null;
      }
    }

    async function openLibrary() {
      try {
        const response = await browser.runtime.sendMessage({ type: 'OPEN_LIBRARY' } satisfies ExtensionMessage) as MessageResponse;
        if (!response?.ok) showToast(response?.error || 'Could not open the library');
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Could not open the library');
      }
    }

    async function showNotePopover(id: string, rect: DOMRect) {
      document.getElementById('anchor-notes-composer')?.remove();
      document.getElementById('anchor-notes-popover')?.remove();
      const note = await getSavedNote(id);
      if (!note) return;
      const popover = document.createElement('div');
      popover.id = 'anchor-notes-popover';
      popover.innerHTML = `
        <div class="anchor-popover-header">
          <span class="anchor-composer-kicker">Saved note</span>
          <button class="anchor-popover-close" type="button" aria-label="Close">×</button>
        </div>
        <div class="anchor-composer-quote"></div>
        <label class="anchor-note-field">
          <span>Current note</span>
          <textarea maxlength="2000" placeholder="Add a note…"></textarea>
        </label>
        <label class="anchor-note-field">
          <span>Tags</span>
          <input class="anchor-tags-input" maxlength="500" placeholder="research, design, reading" />
        </label>
        <div class="anchor-color-row">
          <span>Highlight color</span>
          <div class="anchor-color-picker" role="group" aria-label="Highlight color"></div>
        </div>
        <div class="anchor-composer-actions">
          <button class="anchor-open-library" type="button">Open library</button>
          <button class="anchor-save" type="button">Save changes</button>
        </div>`;
      document.body.appendChild(popover);
      const quote = popover.querySelector<HTMLElement>('.anchor-composer-quote');
      if (quote) quote.textContent = `“${note.quote}”`;
      const textarea = popover.querySelector<HTMLTextAreaElement>('textarea');
      if (textarea) populateCurrentNote(textarea, note);
      const tagsInput = popover.querySelector<HTMLInputElement>('.anchor-tags-input');
      if (tagsInput) tagsInput.value = (note.tags ?? []).join(', ');
      const colorPicker = popover.querySelector<HTMLElement>('.anchor-color-picker');
      const selectColor = (color: HighlightColor) => {
        note.color = color;
        applyColorToMarks(note.id, color);
        if (colorPicker) renderColorPicker(colorPicker, color, selectColor);
        void updateNote(note).then((saved) => {
          if (saved) showToast('Highlight color updated');
        });
      };
      if (colorPicker) renderColorPicker(colorPicker, note.color, selectColor);
      positionFloatingElement(popover, rect);
      popover.querySelector<HTMLButtonElement>('.anchor-popover-close')?.addEventListener('click', () => popover.remove());
      popover.querySelector<HTMLButtonElement>('.anchor-open-library')?.addEventListener('click', () => void openLibrary());
      popover.querySelector<HTMLButtonElement>('.anchor-save')?.addEventListener('click', () => {
        note.body = textarea?.value.trim() ?? '';
        note.tags = parseTags(tagsInput?.value ?? '');
        void updateNote(note).then((saved) => {
          if (!saved) return;
          document.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_CLASS}[data-anchor-id="${CSS.escape(note.id)}"]`).forEach((mark) => {
            mark.title = saved.body || 'Saved in Anchor Notes';
          });
          popover.remove();
          showToast('Note updated');
        });
      });
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
      if (message.type === 'CAPTURE_SELECTION') void showComposer();
      if (message.type === 'SCROLL_TO_NOTE') {
        document.querySelector<HTMLElement>(`[data-anchor-id="${CSS.escape(message.id)}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return undefined;
    });

    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const mark = target?.closest<HTMLElement>(`.${HIGHLIGHT_CLASS}`);
      if (mark?.dataset.anchorId) {
        event.preventDefault();
        event.stopPropagation();
        void showNotePopover(mark.dataset.anchorId, mark.getBoundingClientRect());
        return;
      }
      if (!target?.closest('#anchor-notes-popover')) document.getElementById('anchor-notes-popover')?.remove();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        document.getElementById('anchor-notes-composer')?.remove();
        document.getElementById('anchor-notes-popover')?.remove();
      }
    });
    void restoreHighlights();
  },
});
