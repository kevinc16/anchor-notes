import { expect, it } from 'vitest';
import { parsePdfViewerUrl, pdfViewerUrl, validatePdfSource } from '../lib/pdf-navigation';

const base = 'chrome-extension://synthetic/';
it('encodes original URLs without losing query or fragment', () => {
  const url = pdfViewerUrl(base, 'https://example.test/download?x=1&y=2#page=3', 'saved note');
  expect(parsePdfViewerUrl(url, base)).toEqual({
    source: 'https://example.test/download?x=1&y=2#page=3',
    noteId: 'saved note',
  });
});
it('rejects foreign origins and lookalike extension pages', () => {
  expect(parsePdfViewerUrl('chrome-extension://other/pdf.html?source=https://example.test', base)).toBeUndefined();
  expect(parsePdfViewerUrl('chrome-extension://synthetic/not-pdf.html', base)).toBeUndefined();
});
it('allows only HTTP(S) remote sources', () => {
  expect(validatePdfSource('https://example.test/download')).toBe('https://example.test/download');
  for (const url of [
    'file:///tmp/private.pdf',
    'blob:https://example.test/x',
    'javascript:alert(1)',
    'https://user:secret@example.test/a',
  ]) {
    expect(() => validatePdfSource(url)).toThrow();
  }
});

it('display titles tolerate malformed percent encodings in valid URLs', async () => {
  const { pdfTitleFromUrl } = await import('../lib/pdf-navigation');
  expect(pdfTitleFromUrl('https://example.test/report%FF.pdf')).toBe('report%FF.pdf');
  expect(pdfTitleFromUrl('https://example.test/report%20one.pdf')).toBe('report one.pdf');
});
