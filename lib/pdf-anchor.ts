import type { HighlightAnchor, PdfSelector } from './types';

export function normalizePdfText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}
export function hasPdfSelector(anchor: unknown): boolean {
  return Boolean(anchor && typeof anchor === 'object' && Object.hasOwn(anchor, 'pdf'));
}
export function normalizePdfSelector(value: unknown): PdfSelector | undefined {
  if (!value || typeof value !== 'object') return;
  const p = value as Partial<PdfSelector>;
  if (
    p.version !== 1 ||
    !Number.isSafeInteger(p.pageNumber) ||
    p.pageNumber! < 1 ||
    !Number.isSafeInteger(p.start) ||
    p.start! < 0 ||
    !Number.isSafeInteger(p.end) ||
    p.end! <= p.start! ||
    typeof p.documentHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(p.documentHash)
  )
    return;
  return { version: 1, pageNumber: p.pageNumber!, documentHash: p.documentHash, start: p.start!, end: p.end! };
}
export function findPdfQuote(text: string, anchor: HighlightAnchor): { start: number; end: number } | undefined {
  const p = normalizePdfSelector(anchor.pdf);
  if (typeof anchor.quote?.exact !== 'string') return;
  const quote = normalizePdfText(anchor.quote.exact);
  if (!p || !quote) return;
  if (
    text.slice(p.start, p.end) === quote &&
    (!anchor.quote.prefix || text.slice(0, p.start).endsWith(anchor.quote.prefix)) &&
    (!anchor.quote.suffix || text.slice(p.end).startsWith(anchor.quote.suffix))
  )
    return { start: p.start, end: p.end };
  const matches: Array<{ start: number; end: number; score: number }> = [];
  let start = text.indexOf(quote);
  while (start >= 0) {
    const end = start + quote.length;
    const prefix = anchor.quote.prefix;
    const suffix = anchor.quote.suffix;
    const score =
      Number(Boolean(prefix && text.slice(0, start).endsWith(prefix))) +
      Number(Boolean(suffix && text.slice(end).startsWith(suffix)));
    matches.push({ start, end, score });
    start = text.indexOf(quote, start + 1);
  }
  matches.sort((a, b) => b.score - a.score);
  if (!matches[0] || (matches[1] && matches[0].score === matches[1].score)) return;
  return { start: matches[0].start, end: matches[0].end };
}

type Point = { node: Text; offset: number };
export function indexPdfText(root: HTMLElement) {
  let text = '';
  const positions: Array<{ start: Point; end: Point }> = [];
  function append(char: string, start: Point, end: Point) {
    if (/\s/u.test(char)) {
      if (!text) return;
      if (text.endsWith(' ')) {
        positions[positions.length - 1]!.end = end;
        return;
      }
      char = ' ';
    }
    text += char;
    positions.push({ start, end });
  }
  function walk(node: Node) {
    if (node.nodeType === 3) {
      const value = node as Text;
      for (let i = 0; i < value.length; i++)
        append(value.data[i]!, { node: value, offset: i }, { node: value, offset: i + 1 });
    } else if (node.nodeType === 1 && (node as Element).tagName === 'BR') {
      const point = positions.at(-1)?.end;
      if (point) append(' ', point, point);
    } else node.childNodes.forEach(walk);
  }
  walk(root);
  if (text.endsWith(' ')) {
    text = text.slice(0, -1);
    positions.pop();
  }
  return { text, positions };
}
export function pdfRange(root: HTMLElement, start: number, end: number): Range | undefined {
  const index = indexPdfText(root);
  const first = index.positions[start]?.start,
    last = index.positions[end - 1]?.end;
  if (!first || !last || end <= start) return;
  const range = root.ownerDocument.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset);
  return range;
}
