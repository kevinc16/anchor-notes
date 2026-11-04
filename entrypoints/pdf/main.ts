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
      source.document.querySelectorAll<HTMLElement>('#openFile, #secondaryOpenFile').forEach((button) => {
        button.style.display = 'none';
      });
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
  showPdfStatus('Opening PDF…');
  void file
    .arrayBuffer()
    .then((bytes) => loadPdf(bytes, undefined, file.name, request))
    .catch((error: unknown) => showPdfStatus(error instanceof Error ? error.message : 'Could not read PDF file.'));
});
const initial = parsePdfViewerUrl(location.href, browser.runtime.getURL('/'));
if (initial?.source?.startsWith('http')) {
  input.value = initial.source;
  // Explicit viewer links (library/navigation) open immediately; popup prefill uses a separate parameter.
  void openRemote(initial.source);
} else {
  input.value = new URL(location.href).searchParams.get('prefill') || '';
}
