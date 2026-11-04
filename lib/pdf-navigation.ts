import type { AnchorNote } from './types';
import { hasPdfSelector, normalizePdfSelector } from './pdf-anchor';
export function validatePdfSource(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Enter an HTTP(S) PDF URL, or choose a PDF file.');
  }
  return url.href;
}

export function pdfViewerUrl(extensionBaseUrl: string, source?: string, noteId?: string): string {
  const url = new URL('pdf.html', extensionBaseUrl);
  if (source) url.searchParams.set('source', source);
  if (noteId) url.searchParams.set('note', noteId);
  return url.href;
}

export function parsePdfViewerUrl(value: string, extensionBaseUrl: string) {
  try {
    const url = new URL(value);
    const expected = new URL('pdf.html', extensionBaseUrl);
    // URL.origin is "null" for extension protocols in some runtimes.
    if (url.protocol !== expected.protocol || url.host !== expected.host || url.pathname !== expected.pathname) return;
    return { source: url.searchParams.get('source') || undefined, noteId: url.searchParams.get('note') || undefined };
  } catch {
    return undefined;
  }
}

export async function pdfHash(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function pdfTitleFromUrl(value: string): string {
  const name = new URL(value).pathname.split('/').pop() || 'PDF document';
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

export function noteSourceUrl(
  note: Pick<AnchorNote, 'id' | 'url'> & Partial<Pick<AnchorNote, 'anchor'>>,
  base: string,
): string {
  if (!hasPdfSelector(note.anchor)) return note.url;
  const url = new URL(pdfViewerUrl(base, note.url, note.id));
  const pdf = normalizePdfSelector(note.anchor?.pdf);
  if (pdf) url.searchParams.set('document', pdf.documentHash);
  return url.href;
}
