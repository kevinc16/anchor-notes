import { expect, it } from 'vitest';
import { findPdfQuote, normalizePdfSelector, normalizePdfText } from '../lib/pdf-anchor';
import type { HighlightAnchor } from '../lib/types';
const pdf = { version: 1 as const, pageNumber: 1, documentHash: 'a'.repeat(64), start: 0, end: 5 };
function anchor(exact: string, prefix = '', suffix = '', start = 0, end = exact.length): HighlightAnchor {
  return {
    quote: { exact, prefix, suffix },
    startPath: '',
    startOffset: 0,
    endPath: '',
    endOffset: 0,
    pdf: { ...pdf, start, end },
  };
}
it('normalizes whitespace while preserving Unicode and case', () => {
  expect(normalizePdfText('  A\n café\t研究 ')).toBe('A café 研究');
});
it('rejects malformed page/offset/hash selectors', () => {
  expect(normalizePdfSelector(pdf)).toEqual(pdf);
  for (const patch of [
    { pageNumber: 0 },
    { pageNumber: 1.5 },
    { start: -1 },
    { end: 0 },
    { version: 2 },
    { documentHash: 'bad' },
  ])
    expect(normalizePdfSelector({ ...pdf, ...patch })).toBeUndefined();
});
it('restores validated offsets or unique quote/context, never an ambiguous occurrence', () => {
  expect(findPdfQuote('hello world', anchor('world', '', '', 6, 11))).toEqual({ start: 6, end: 11 });
  expect(findPdfQuote('old quote then new quote end', anchor('quote', 'new ', ' end', 99, 104))).toEqual({
    start: 19,
    end: 24,
  });
  expect(findPdfQuote('quote and quote', anchor('quote', '', '', 99, 104))).toBeUndefined();
  expect(findPdfQuote('', anchor('quote'))).toBeUndefined();
});

it('maps normalized multi-span text and line breaks back into a DOM range', async () => {
  const { Window } = await import('happy-dom');
  const window = new Window();
  const root = window.document.createElement('div');
  root.innerHTML = '<span>  Hello </span><span>world</span><br><span>研究</span>';
  window.document.body.append(root);
  const { indexPdfText, pdfRange } = await import('../lib/pdf-anchor');
  expect(indexPdfText(root as unknown as HTMLElement).text).toBe('Hello world 研究');
  expect(pdfRange(root as unknown as HTMLElement, 6, 14)?.toString()).toBe('world研究');
  window.happyDOM.abort();
});
