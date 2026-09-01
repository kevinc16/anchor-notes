export const LIBRARY_CARD_PREVIEW_MAX_LENGTH = 240;
const PREVIEW_ELLIPSIS = '…';

const BLOCK_TAG_PATTERN =
  /<\/?(?:address|article|aside|blockquote|dd|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/gi;
const MARKUP_PATTERN = /<!--|<\/?[a-z][^>]*>/i;
const LINE_BREAK_TAG_PATTERN = /<br\s*\/?>/gi;

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39|#x27);/gi, (entity) => {
    switch (entity.toLowerCase()) {
      case '&amp;':
        return '&';
      case '&lt;':
        return '<';
      case '&gt;':
        return '>';
      case '&quot;':
        return '"';
      case '&apos;':
      case '&#39;':
      case '&#x27;':
        return "'";
      case '&nbsp;':
        return ' ';
      default:
        return entity;
    }
  });
}

function stripMarkup(value: string): string {
  if (!MARKUP_PATTERN.test(value)) return value;

  const withLineBreaks = value.replace(LINE_BREAK_TAG_PATTERN, '\n').replace(BLOCK_TAG_PATTERN, '\n');
  if (typeof DOMParser !== 'undefined') {
    const document = new DOMParser().parseFromString(withLineBreaks, 'text/html');
    return document.body.textContent ?? '';
  }

  return decodeHtmlEntities(withLineBreaks)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?[a-z][^>]*>/gi, '');
}

export function normalizePreviewText(value: string): string {
  return stripMarkup(value)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function getLibraryCardPreview(value: string, maxLength = LIBRARY_CARD_PREVIEW_MAX_LENGTH): string {
  const normalized = normalizePreviewText(value);
  const limit = Math.max(0, Math.floor(maxLength));
  if (limit === 0) return '';

  const characters = Array.from(normalized);
  if (characters.length <= limit) return normalized;

  const availableCharacters = Math.max(0, limit - PREVIEW_ELLIPSIS.length);
  return `${characters.slice(0, availableCharacters).join('').trimEnd()}${PREVIEW_ELLIPSIS}`;
}

export function isLibraryCardPreviewTruncated(value: string, maxLength = LIBRARY_CARD_PREVIEW_MAX_LENGTH): boolean {
  return getLibraryCardPreview(value, maxLength) !== normalizePreviewText(value);
}
