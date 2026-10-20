import { HIGHLIGHT_CLASS, removeEmptyHighlightMarks, wrapHighlightRange } from './highlight-dom';
import { findTextRange } from './text-range';
import type { AnchorData } from './types';
import { normalizeUrl } from './websites';

const MARK_SELECTOR = `mark.${HIGHLIGHT_CLASS}`;
const IGNORED_UI = 'script, style, textarea, #anchor-notes-composer, #anchor-notes-popover, #anchor-notes-toast';

// Snapshot fragments, rather than just IDs: a framework may replace only part of a quote.
type Fragment = { mark: HTMLElement; text: string | null };
type RenderedHighlight = { fragments: Fragment[]; text: string };

export function observeHighlightRestoration(document: Document, readData: () => Promise<AnchorData>) {
  const window = document.defaultView!;
  let stopped = false;
  let revision = 0;
  let timer: number | undefined;
  let currentUrl = normalizeUrl(document.location.href);
  let currentCanonical = canonicalUrl();
  let staleCanonical = '';
  const rendered = new Map<string, RenderedHighlight>();

  function canonicalUrl() {
    const href = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
    return href ? normalizeUrl(href) : '';
  }

  function unwrap(marks: HTMLElement[]) {
    const parents = new Set<Node>();
    for (const mark of marks) {
      if (mark.parentNode) parents.add(mark.parentNode);
      mark.replaceWith(...mark.childNodes);
    }
    parents.forEach((parent) => parent.normalize());
  }

  function textBetweenMarks(marks: HTMLElement[]) {
    const first = marks[0];
    const last = marks.at(-1);
    if (!first || !last) return '';
    const range = document.createRange();
    range.setStartBefore(first);
    range.setEndAfter(last);
    return range.toString();
  }

  function observe() {
    observer.observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['href', 'rel'],
    });
  }

  function isIgnored(node: Node): boolean {
    const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
    return Boolean(element?.closest(IGNORED_UI));
  }

  const observer = new window.MutationObserver((records) => {
    if (
      records.some((record) => {
        if (isIgnored(record.target)) return false;
        if (record.type === 'attributes') return (record.target as Element).tagName === 'LINK';
        if (record.type === 'characterData') return true;
        return [...record.addedNodes, ...record.removedNodes].some((node) => !isIgnored(node));
      })
    )
      schedule();
  });

  function refresh() {
    if (stopped) return;
    revision += 1;
    schedule();
  }

  function schedule() {
    if (stopped) return;
    // Coalesce bursts without postponing forever on continuously changing pages.
    timer ??= window.setTimeout(() => {
      timer = undefined;
      void restore();
    }, 150);
  }

  async function restore() {
    const startedAt = revision;
    const url = normalizeUrl(document.location.href);
    const canonical = canonicalUrl();
    try {
      const data = await readData();
      if (stopped || startedAt !== revision) return;
      if (url !== normalizeUrl(document.location.href) || canonical !== canonicalUrl()) {
        refresh();
        return;
      }
      if (!document.body) return;

      // The router can update history before updating its old canonical metadata.
      if (url !== currentUrl) staleCanonical = canonical === currentCanonical ? canonical : '';
      if (canonical !== currentCanonical) staleCanonical = '';
      const pageChanged = url !== currentUrl || canonical !== currentCanonical;
      currentUrl = url;
      currentCanonical = canonical;
      const pageUrls = new Set([url]);
      if (canonical && canonical !== staleCanonical) pageUrls.add(canonical);
      const notes = data.notes.filter(
        (note) =>
          pageUrls.has(normalizeUrl(note.url)) ||
          Boolean(note.canonicalUrl && pageUrls.has(normalizeUrl(note.canonicalUrl))),
      );

      // Only synchronous writes happen while disconnected; page changes during storage reads remain observed.
      observer.disconnect();
      try {
        const allMarks = [...document.querySelectorAll<HTMLElement>(MARK_SELECTOR)];
        const noteIds = new Set(notes.map((note) => note.id));
        unwrap(allMarks.filter((mark) => pageChanged || !noteIds.has(mark.dataset.anchorId ?? '')));
        if (pageChanged) rendered.clear();
        removeEmptyHighlightMarks(document.body);
        const existing = new Map<string, HTMLElement[]>();
        for (const mark of document.querySelectorAll<HTMLElement>(MARK_SELECTOR)) {
          const id = mark.dataset.anchorId ?? '';
          const group = existing.get(id) ?? [];
          group.push(mark);
          existing.set(id, group);
        }
        for (const note of notes) {
          let marks = existing.get(note.id) ?? [];
          const previous = rendered.get(note.id);
          const intact =
            marks.length > 0 &&
            (!previous ||
              (previous.fragments.length === marks.length &&
                previous.text === textBetweenMarks(marks) &&
                previous.fragments.every(
                  (fragment, index) => fragment.mark === marks[index] && fragment.text === marks[index]?.textContent,
                )));
          if (!intact) {
            unwrap(marks);
            const selector = note.anchor?.quote;
            const range = findTextRange(
              document.body,
              selector?.exact || note.quote,
              selector?.prefix,
              selector?.suffix,
            );
            if (range) wrapHighlightRange(range, note, data.settings.highlightCoverage);
            marks = [...document.querySelectorAll<HTMLElement>(MARK_SELECTOR)].filter(
              (mark) => mark.dataset.anchorId === note.id,
            );
          }
          rendered.set(note.id, {
            fragments: marks.map((mark) => ({ mark, text: mark.textContent })),
            text: textBetweenMarks(marks),
          });
        }
        for (const id of rendered.keys()) if (!noteIds.has(id)) rendered.delete(id);
      } finally {
        observe();
      }
    } catch {
      // Navigation or extension invalidation can make local storage/DOM access unavailable.
      // A later mutation or refresh can retry without interrupting the host page.
    }
  }

  observe();
  void restore();
  return {
    refresh,
    stop() {
      stopped = true;
      revision += 1;
      if (timer !== undefined) window.clearTimeout(timer);
      observer.disconnect();
      rendered.clear();
    },
  };
}
