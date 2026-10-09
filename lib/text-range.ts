import { HIGHLIGHT_CLASS } from './highlight-dom';

const IGNORED_TEXT_SELECTOR = `script, style, textarea, #anchor-notes-composer, #anchor-notes-popover, .${HIGHLIGHT_CLASS}`;

const BLOCK_ELEMENTS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'CAPTION',
  'DD',
  'DETAILS',
  'DIALOG',
  'DIV',
  'DL',
  'DT',
  'FIELDSET',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HGROUP',
  'HR',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'SUMMARY',
  'TABLE',
  'TBODY',
  'TD',
  'TFOOT',
  'TH',
  'THEAD',
  'TR',
  'UL',
]);

interface TextPosition {
  node: Text;
  offset: number;
}

interface IndexedText {
  value: string;
  positions: Array<TextPosition | undefined>;
}

interface TextMatch {
  start: number;
  end: number;
  score: number;
}

export function normalizeQuoteWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function isIgnoredElement(element: Element): boolean {
  return element.matches(IGNORED_TEXT_SELECTOR);
}

function isBlockElement(element: Element): boolean {
  return BLOCK_ELEMENTS.has(element.tagName);
}

function hasBlockChild(element: Element): boolean {
  return [...element.children].some((child) => isBlockElement(child) && !isIgnoredElement(child));
}

function appendCharacter(index: IndexedText, character: string, position?: TextPosition): void {
  index.value += character;
  index.positions.push(position);
}

function appendTextNode(index: IndexedText, node: Text): void {
  const value = node.nodeValue ?? '';
  for (let offset = 0; offset < value.length; offset += 1) {
    appendCharacter(index, value[offset] ?? '', { node, offset });
  }
}

function appendSyntheticLineBreak(index: IndexedText): void {
  appendCharacter(index, '\n');
}

function appendNode(index: IndexedText, node: Node, includeLayoutBreaks: boolean): void {
  if (node.nodeType === 3) {
    appendTextNode(index, node as Text);
    return;
  }
  if (node.nodeType !== 1) {
    node.childNodes.forEach((child) => appendNode(index, child, includeLayoutBreaks));
    return;
  }

  const element = node as Element;
  if (isIgnoredElement(element)) return;
  if (includeLayoutBreaks && element.tagName === 'BR') {
    appendSyntheticLineBreak(index);
    return;
  }

  element.childNodes.forEach((child) => appendNode(index, child, includeLayoutBreaks));
  if (includeLayoutBreaks && isBlockElement(element) && !hasBlockChild(element)) {
    appendSyntheticLineBreak(index);
  }
}

function indexText(root: Node, includeLayoutBreaks: boolean): IndexedText {
  const index: IndexedText = { value: '', positions: [] };
  appendNode(index, root, includeLayoutBreaks);
  return index;
}

function normalizeIndexedText(index: IndexedText): IndexedText {
  const normalized: IndexedText = { value: '', positions: [] };
  let pendingWhitespace = false;
  let pendingPosition: TextPosition | undefined;

  for (let offset = 0; offset < index.value.length; offset += 1) {
    const character = index.value[offset] ?? '';
    if (/\s/u.test(character)) {
      pendingWhitespace = true;
      pendingPosition ??= index.positions[offset];
      continue;
    }

    if (pendingWhitespace && normalized.value.length > 0) {
      appendCharacter(normalized, ' ', pendingPosition);
    }
    appendCharacter(normalized, character, index.positions[offset]);
    pendingWhitespace = false;
    pendingPosition = undefined;
  }

  return normalized;
}

function findMatch(value: string, exact: string, prefix: string, suffix: string): TextMatch | null {
  const matches: TextMatch[] = [];
  let from = 0;
  while ((from = value.indexOf(exact, from)) >= 0) {
    const prefixMatches = prefix && value.slice(Math.max(0, from - prefix.length), from).endsWith(prefix);
    const suffixMatches =
      suffix && value.slice(from + exact.length, from + exact.length + suffix.length).startsWith(suffix);
    matches.push({
      start: from,
      end: from + exact.length,
      score: (prefixMatches ? 2 : 0) + (suffixMatches ? 2 : 0),
    });
    from += Math.max(exact.length, 1);
  }
  return matches.sort((left, right) => right.score - left.score)[0] ?? null;
}

function rangeForMatch(root: Node, index: IndexedText, match: TextMatch): Range | null {
  const document = root.ownerDocument;
  if (!document) return null;

  let startPosition: TextPosition | undefined;
  let endPosition: TextPosition | undefined;
  for (let offset = match.start; offset < match.end; offset += 1) {
    const position = index.positions[offset];
    if (!position) continue;
    startPosition ??= position;
    endPosition = { node: position.node, offset: position.offset + 1 };
  }
  if (!startPosition || !endPosition) return null;

  try {
    const range = document.createRange();
    range.setStart(startPosition.node, startPosition.offset);
    range.setEnd(endPosition.node, endPosition.offset);
    return range;
  } catch {
    return null;
  }
}

export function findTextRange(root: Node, exact: string, prefix = '', suffix = ''): Range | null {
  const normalizedExact = normalizeQuoteWhitespace(exact);
  if (!normalizedExact) return null;

  const normalizedPrefix = normalizeQuoteWhitespace(prefix);
  const normalizedSuffix = normalizeQuoteWhitespace(suffix);
  const indexes = [indexText(root, true), indexText(root, false)];
  for (const rawIndex of indexes) {
    const index = normalizeIndexedText(rawIndex);
    const match = findMatch(index.value, normalizedExact, normalizedPrefix, normalizedSuffix);
    if (!match) continue;
    const range = rangeForMatch(root, index, match);
    if (range) return range;
  }
  return null;
}
