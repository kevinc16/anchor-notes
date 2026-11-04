import {
  associatePdfSource,
  keepPdfDocument,
  readPdfDocument,
  findPdfDocument,
  removePdfDocument,
} from '@/lib/pdf-documents';
import { browser } from '#imports';
import { watchTheme } from '@/lib/browser-theme';
import { parsePdfViewerUrl, pdfHash, pdfTitleFromUrl, validatePdfSource } from '@/lib/pdf-navigation';
import type { PdfApplication, PdfWindow } from '@/lib/pdf-viewer-types';
import './style.css';

export interface LoadedPdf {
  url: string;
  title: string;
  documentHash: string;
  bytes: Blob;
}
let current: LoadedPdf | undefined;
export function currentPdf() {
  return current;
}
const frame = document.querySelector<HTMLIFrameElement>('#pdf-viewer')!;
const status = document.querySelector<HTMLElement>('#pdf-status')!;
const input = document.querySelector<HTMLInputElement>('#source-url')!;
let revision = 0;
let controller: AbortController | undefined;
let viewerWork: Promise<unknown> = Promise.resolve();
export function showPdfStatus(message: string) {
  status.textContent = message;
}
export const viewerReady = new Promise<PdfApplication>((resolve) => {
  document.addEventListener('webviewerloaded', (event) => {
    const source = (event as CustomEvent<{ source: PdfWindow }>).detail?.source;
    if (source !== frame.contentWindow) return;
    source.PDFViewerApplicationOptions.setAll({
      defaultUrl: '',
      enableScripting: false,
      disablePreferences: true,
      isEvalSupported: false,
      enableXfa: false,
      annotationEditorMode: -1,
      enableAltText: false,
      enableGuessAltText: false,
      enableScriptingInXfa: false,
      externalLinkTarget: 2,
      externalLinkRel: 'noopener noreferrer',
    });
    void source.PDFViewerApplication.initializedPromise.then(() => {
      const style = source.document.createElement('style');
      style.textContent = '#openFile, #secondaryOpenFile { display: none !important; }';
      source.document.head.append(style);
      source.document.addEventListener(
        'keydown',
        (event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') {
            event.preventDefault();
            event.stopImmediatePropagation();
            document.querySelector<HTMLInputElement>('#open-file')!.click();
          }
        },
        true,
      );
      source.document.addEventListener(
        'drop',
        (e) => {
          e.preventDefault();
          e.stopImmediatePropagation();
        },
        true,
      );
      resolve(source.PDFViewerApplication);
    });
  });
});
frame.src = browser.runtime.getURL('/pdfjs/web/viewer.html') + '?file=';
watchTheme((theme) => {
  document.documentElement.style.colorScheme = theme;
});
document.querySelector('#open-library')!.addEventListener('click', () => void browser.runtime.openOptionsPage());

export function loadPdf(bytes: ArrayBuffer, source?: string, filename = 'PDF document', expectedRevision = ++revision) {
  const work = viewerWork.catch(() => undefined).then(() => renderPdf(bytes, source, filename, expectedRevision));
  viewerWork = work;
  return work;
}

async function renderPdf(bytes: ArrayBuffer, source: string | undefined, filename: string, expectedRevision: number) {
  const app = await viewerReady;
  const hash = await pdfHash(bytes);
  if (expectedRevision !== revision) return;
  const snapshot = new Blob([bytes], { type: 'application/pdf' });
  await app.close();
  if (expectedRevision !== revision) return;
  try {
    const opening = app.open({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      enableXfa: false,
      docBaseUrl: undefined,
    });
    if (app.pdfLoadingTask) {
      app.pdfLoadingTask.onPassword = (callback) => callback(new Error('Password-protected PDFs are unsupported.'));
    }
    await opening;
    if (expectedRevision !== revision) return;
    current = {
      url: source || `anchor-notes:pdf:sha256:${hash}`,
      title: filename,
      documentHash: hash,
      bytes: snapshot,
    };
    document.title = `${filename} — Anchor Notes`;
    const original = document.querySelector<HTMLAnchorElement>('#open-original')!;
    original.hidden = !source;
    if (source) original.href = source;
    const url = new URL(location.href);
    url.searchParams.set('source', current.url);
    url.searchParams.set('document', hash);
    history.replaceState(null, '', url);
    showPdfStatus('PDF opened. Selectable text is available on text-based pages; OCR is not supported.');
    window.dispatchEvent(new CustomEvent('anchor:pdf-loaded', { detail: current }));
  } catch {
    await app.close();
    throw new Error(
      'This PDF could not be opened. Password-protected or malformed PDFs are unsupported. Open the original in your browser instead.',
    );
  }
}

async function openRemote(source: string) {
  const request = ++revision;
  controller?.abort();
  controller = new AbortController();
  current = undefined;
  window.dispatchEvent(new Event('anchor:pdf-storage'));
  showPdfStatus('Loading PDF…');
  try {
    const app = await viewerReady;
    await app.close();
    if (request !== revision) return;
    const url = validatePdfSource(source);
    const original = document.querySelector<HTMLAnchorElement>('#open-original')!;
    original.href = url;
    original.hidden = false;
    const response = await fetch(url, { signal: controller.signal, credentials: 'include' });
    if (!response.ok) throw new Error('The PDF could not be downloaded.');
    const bytes = await response.arrayBuffer();
    if (request !== revision) return;
    if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes('%PDF-'))
      throw new Error('The response is not a PDF.');
    await loadPdf(bytes, url, pdfTitleFromUrl(url), request);
  } catch (error) {
    if (request !== revision) return;
    showPdfStatus(
      `${error instanceof Error ? error.message : 'Could not load PDF.'} Choose a PDF file if the URL requires login, a POST request, or has expired.`,
    );
  }
}
document.querySelector('#open-url')!.addEventListener('submit', (event) => {
  event.preventDefault();
  void openRemote(input.value);
});
document.querySelector<HTMLInputElement>('#open-file')!.addEventListener('change', (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const request = ++revision;
  controller?.abort();
  current = undefined;
  window.dispatchEvent(new Event('anchor:pdf-storage'));
  showPdfStatus('Opening PDF…');
  void file
    .arrayBuffer()
    .then((bytes) => loadPdf(bytes, undefined, file.name, request))
    .catch((error: unknown) => showPdfStatus(error instanceof Error ? error.message : 'Could not read PDF file.'));
});
const keepButton = document.querySelector<HTMLButtonElement>('#keep-pdf')!;
const removeButton = document.querySelector<HTMLButtonElement>('#remove-pdf')!;
async function refreshKeptState(associateSource = false) {
  const document = current;
  keepButton.disabled = !document;
  removeButton.hidden = true;
  keepButton.textContent = 'Keep PDF on this device';
  if (!document) return;
  try {
    const kept = await readPdfDocument(document.documentHash);
    if (document !== current) return;
    if (kept && associateSource) await associatePdfSource(document.url, document.documentHash);
    if (document !== current) return;
    keepButton.textContent = kept ? 'PDF kept on this device' : 'Keep PDF on this device';
    keepButton.disabled = Boolean(kept);
    removeButton.hidden = !kept;
  } catch {
    showPdfStatus('PDF opened. Local document storage is unavailable; viewing and notes still work.');
  }
}
window.addEventListener('anchor:pdf-loaded', () => {
  void refreshKeptState(true);
});
window.addEventListener('anchor:pdf-storage', () => {
  void refreshKeptState();
});
const changes = new BroadcastChannel('anchor-pdf-storage');
changes.onmessage = () => {
  void refreshKeptState();
};
keepButton.addEventListener('click', () => {
  const document = current;
  if (!document) return;
  keepButton.disabled = true;
  void keepPdfDocument({
    hash: document.documentHash,
    bytes: document.bytes,
    title: document.title,
    sourceUrl: document.url,
  })
    .then(() => {
      if (document === current)
        showPdfStatus('PDF kept on this device. It can reopen offline. JSON backups include notes, not PDF files.');
    })
    .catch(() => {
      if (document === current) {
        keepButton.disabled = false;
        showPdfStatus('Could not keep PDF: storage may be full or unavailable. Viewing and note saving still work.');
      }
    });
});
removeButton.title =
  'Remove the saved copy; notes remain. Reopening may require downloading or selecting this PDF again.';
removeButton.addEventListener('click', () => {
  if (!current) return;
  void removePdfDocument(current.documentHash)
    .then(() => showPdfStatus('Saved PDF removed. Notes remain; the open PDF is still usable.'))
    .catch(() => showPdfStatus('Could not remove the saved PDF. Try again.'));
});
document.querySelector('#reload-source')!.addEventListener('click', () => {
  if (current?.url.startsWith('http')) void openRemote(current.url);
});

const initial = parsePdfViewerUrl(location.href, browser.runtime.getURL('/'));
async function openInitial() {
  const request = revision;
  const source = initial?.source;
  const hash =
    new URL(location.href).searchParams.get('document') ||
    (source?.startsWith('anchor-notes:pdf:sha256:') ? source.slice(-64) : undefined);
  if (source) {
    try {
      const saved = hash ? await readPdfDocument(hash) : await findPdfDocument(source);
      if (request !== revision) return;
      if (saved) {
        const bytes = await saved.bytes.arrayBuffer();
        if (request !== revision) return;
        await loadPdf(bytes, source.startsWith('http') ? source : undefined, saved.title, request);
        if (request !== revision) return;
        showPdfStatus('Saved PDF opened from this device. JSON backups do not include PDF files.');
        document.querySelector<HTMLElement>('#reload-source')!.hidden = !source.startsWith('http');
        return;
      }
    } catch {
      /* Loading the source/file still works if IndexedDB is unavailable. */
    }
    if (request !== revision) return;
    if (source.startsWith('http')) {
      input.value = source;
      await openRemote(source);
    } else showPdfStatus('No saved copy is available. Choose the same PDF file to restore its notes.');
  } else input.value = new URL(location.href).searchParams.get('prefill') || '';
}
void openInitial();
