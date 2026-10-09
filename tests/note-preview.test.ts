import { describe, expect, it } from 'vitest';
import {
  getLibraryCardPreview,
  isLibraryCardPreviewTruncated,
  LIBRARY_CARD_PREVIEW_MAX_LENGTH,
  normalizePreviewText,
} from '../lib/note-preview';

describe('library card previews', () => {
  it('strips markup, normalizes whitespace, and keeps meaningful line breaks', () => {
    const source = '  <p>First <strong>styled</strong> idea</p>\r\n\r\n<p>Second idea</p>\n\n\nThird idea  ';

    expect(normalizePreviewText(source)).toBe('First styled idea\nSecond idea\nThird idea');
  });

  it('collapses duplicate newlines without changing a single newline', () => {
    expect(normalizePreviewText('First line\nSecond line\n\n\nThird line')).toBe('First line\nSecond line\nThird line');
  });

  it('truncates at a word boundary and adds a three-dot suffix', () => {
    const source = 'First line with more words';
    const preview = getLibraryCardPreview(source, 16);

    expect(preview).toBe('First line...');
    expect(Array.from(preview).length).toBeLessThanOrEqual(16);
  });

  it('preserves meaningful spaces and line breaks before the suffix', () => {
    const source = 'First line\nSecond line with more words';

    expect(getLibraryCardPreview(source, 16)).toBe('First line\n...');
  });

  it('does not append an ellipsis when the normalized text fits', () => {
    expect(getLibraryCardPreview('First\n\nSecond', 12)).toBe('First\nSecond');
  });

  it('reports whether a preview needs a reveal control', () => {
    expect(isLibraryCardPreviewTruncated('Short quote', 20)).toBe(false);
    expect(isLibraryCardPreviewTruncated('A quote that is too long', 10)).toBe(true);
  });

  it('enforces the default limit without changing the source content', () => {
    const source = `${'A useful phrase. '.repeat(20)}A final phrase.`;
    const sourceLength = source.length;
    const preview = getLibraryCardPreview(source);

    expect(Array.from(preview).length).toBeLessThanOrEqual(LIBRARY_CARD_PREVIEW_MAX_LENGTH);
    expect(preview.endsWith('...')).toBe(true);
    expect(source).toHaveLength(sourceLength);
  });
});
