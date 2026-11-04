import { browser } from '#imports';
import { mountNoteUi, type CaptureResult } from '@/lib/note-ui';
import { indexPdfText, pdfRange, findPdfQuote, normalizePdfSelector } from '@/lib/pdf-anchor';
import { readData, normalizeUrl } from '@/lib/storage';
import type { AnchorNote, HighlightCoverage } from '@/lib/types';
import type { PdfApplication } from '@/lib/pdf-viewer-types';
import type { LoadedPdf } from './main';
import noteCss from '../anchor.content/style.css?url';
import deleteCss from '@/styles/delete-confirmation.css?url';

export function mountPdfHighlights(
  app: PdfApplication,
  document: Document,
  current: () => LoadedPdf | undefined,
  status: (message: string) => void,
) {
  let revision = 0;
  let coverage: HighlightCoverage = 'medium';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const window = document.defaultView!;
  for (const href of [noteCss, deleteCss]) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL(href, location.href).href;
    document.head.append(link);
  }
  function remove(id: string) {
    document
      .querySelectorAll<HTMLElement>(`.anchor-pdf-highlight[data-anchor-id="${CSS.escape(id)}"]`)
      .forEach((item) => item.remove());
  }
  async function render(note: AnchorNote): Promise<boolean> {
    const existing = [
      ...document.querySelectorAll<HTMLButtonElement>(`.anchor-pdf-highlight[data-anchor-id="${CSS.escape(note.id)}"]`),
    ];
    const source = current();
    const p = normalizePdfSelector(note.anchor?.pdf);
    if (
      !source ||
      !p ||
      p.documentHash !== source.documentHash ||
      normalizeUrl(note.url) !== normalizeUrl(source.url)
    ) {
      remove(note.id);
      return false;
    }
    const page = document.querySelector<HTMLElement>(`.page[data-page-number="${p.pageNumber}"]`);
    const text = page?.querySelector<HTMLElement>('.textLayer');
    if (!page || !text) {
      remove(note.id);
      return false;
    }
    const match = findPdfQuote(indexPdfText(text).text, note.anchor);
    const range = match && pdfRange(text, match.start, match.end);
    if (!range) {
      remove(note.id);
      return false;
    }
    const bounds = page.getBoundingClientRect();
    const seen = new Set<string>();
    for (const rect of range.getClientRects()) {
      if (!rect.width || !rect.height) continue;
      const key = [rect.x, rect.y, rect.width, rect.height].map((v) => Math.round(v * 2)).join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      const mark = existing[seen.size - 1] || document.createElement('button');
      mark.type = 'button';
      mark.className = 'anchor-note-highlight anchor-pdf-highlight';
      mark.dataset.anchorId = note.id;
      mark.dataset.anchorColor = note.color;
      mark.dataset.anchorCoverage = coverage;
      mark.title = note.body || 'Saved in Anchor Notes';
      mark.setAttribute('aria-label', `Edit highlight: ${note.quote}`);
      Object.assign(mark.style, {
        position: 'absolute',
        left: `${rect.left - bounds.left - page.clientLeft}px`,
        top: `${rect.top - bounds.top - page.clientTop}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        border: '0',
        padding: '0',
        zIndex: '5',
        pointerEvents: 'none',
      });
      if (mark.parentElement !== page) page.append(mark);
    }
    existing.slice(seen.size).forEach((mark) => mark.remove());
    return seen.size > 0;
  }
  function captureSelection(): CaptureResult {
    const source = current();
    const selection = window.getSelection();
    if (!source || !selection?.rangeCount || selection.isCollapsed)
      return { error: 'Select text on a PDF page first. Image-only pages require OCR, which is not supported.' };
    const range = selection.getRangeAt(0);
    const element = (node: Node) => (node.nodeType === 1 ? (node as Element) : node.parentElement);
    const page = element(range.startContainer)?.closest<HTMLElement>('.page');
    const endPage = element(range.endContainer)?.closest('.page');
    if (!page || page !== endPage) return { error: 'Select text within one PDF page' };
    const text = page.querySelector<HTMLElement>('.textLayer');
    if (!text || !text.contains(range.startContainer) || !text.contains(range.endContainer))
      return { error: 'Select text from the PDF text layer.' };
    const index = indexPdfText(text);
    const selected = index.positions
      .map((point, i) => ({ point, i }))
      .filter(
        ({ point }) =>
          range.comparePoint(point.start.node, point.start.offset) === 0 &&
          range.comparePoint(point.end.node, point.end.offset) === 0,
      );
    let start = selected[0]?.i ?? 0,
      end = (selected.at(-1)?.i ?? -1) + 1;
    while (start < end && index.text[start] === ' ') start++;
    while (end > start && index.text[end - 1] === ' ') end--;
    if (start >= end) return { error: 'Select text on a PDF page first.' };
    const quote = index.text.slice(start, end);
    return {
      capture: {
        url: source.url,
        canonicalUrl: source.url,
        title: source.title,
        quote,
        anchor: {
          quote: {
            exact: quote,
            prefix: index.text.slice(Math.max(0, start - 48), start),
            suffix: index.text.slice(end, end + 48),
          },
          startPath: '',
          startOffset: 0,
          endPath: '',
          endOffset: 0,
          pdf: {
            version: 1,
            pageNumber: Number(page.dataset.pageNumber),
            documentHash: source.documentHash,
            start,
            end,
          },
        },
        pageSnapshot: { description: '', capturedAt: new Date().toISOString() },
        rect: range.getBoundingClientRect(),
      },
    };
  }
  const ui = mountNoteUi(document, { captureSelection, renderNote: render, removeNote: remove });
  // Overlays do not intercept dragging/selecting underlying PDF text. Mouse clicks
  // are resolved geometrically; keyboard activation uses the shared editor listener.
  document.addEventListener('click', (event) => {
    if (!window.getSelection()?.isCollapsed) return;
    const target = event.target as Element;
    if (target.closest('#anchor-notes-composer, #anchor-notes-popover')) return;
    const mark = [...document.querySelectorAll<HTMLElement>('.anchor-pdf-highlight')].find((mark) => {
      const rect = mark.getBoundingClientRect();
      return (
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      );
    });
    if (mark?.dataset.anchorId) {
      event.preventDefault();
      void ui.showNote(mark.dataset.anchorId, mark.getBoundingClientRect());
    }
  });
  async function refresh() {
    const started = ++revision;
    const source = current();
    const data = await readData();
    if (started !== revision || !source || source !== current()) return;
    coverage = data.settings.highlightCoverage;
    const matching = data.notes.filter(
      (note) => normalizeUrl(note.url) === normalizeUrl(source.url) && note.anchor?.pdf,
    );
    if (matching.some((note) => normalizePdfSelector(note.anchor.pdf)?.documentHash !== source.documentHash))
      status(
        'Some saved highlights belong to a different version of this PDF. Open their saved copy from the library or select the original file.',
      );
    const ids = new Set(matching.map((note) => note.id));
    document.querySelectorAll<HTMLElement>('.anchor-pdf-highlight').forEach((mark) => {
      if (!ids.has(mark.dataset.anchorId || '')) mark.remove();
    });
    for (const note of matching) await render(note);
  }
  function schedule() {
    revision++;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void refresh().catch(() => status('Could not restore PDF highlights. Try reopening the document.'));
    }, 80);
  }
  for (const event of ['textlayerrendered', 'pagerendered', 'scalechanging', 'rotationchanging'])
    app.eventBus.on(event, schedule);
  browser.storage.onChanged.addListener((_changes, area) => {
    if (area === 'local') schedule();
  });
  window.addEventListener('resize', schedule);
  async function showNote(id: string) {
    const source = current();
    const data = await readData();
    if (source !== current()) return false;
    const note = data.notes.find((note) => note.id === id);
    const p = normalizePdfSelector(note?.anchor?.pdf);
    if (!note || !p || p.documentHash !== current()?.documentHash) {
      status('This highlight belongs to a different or unavailable PDF.');
      return false;
    }
    if (!app.pdfDocument || p.pageNumber > app.pdfDocument.numPages) {
      status('The saved PDF page is unavailable.');
      return false;
    }
    app.pdfViewer.scrollPageIntoView({ pageNumber: p.pageNumber });
    schedule();
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (source !== current()) return false;
      if (await render(note)) {
        document
          .querySelector<HTMLElement>(`.anchor-pdf-highlight[data-anchor-id="${CSS.escape(id)}"]`)
          ?.scrollIntoView({ block: 'center' });
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    status('The saved quote could not be restored on this PDF page.');
    return false;
  }
  schedule();
  return { showComposer: ui.showComposer, showNote, refresh: schedule };
}
