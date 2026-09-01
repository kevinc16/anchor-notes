import { describe, expect, it } from 'vitest';
import { getLibraryCardPreview, LIBRARY_CARD_PREVIEW_MAX_LENGTH, normalizePreviewText } from '../lib/note-preview';

describe('library card previews', () => {
  it('strips markup, normalizes whitespace, and keeps meaningful line breaks', () => {
    const source = '  <p>First <strong>styled</strong> idea</p>\r\n\r\n<p>Second idea</p>\n\n\nThird idea  ';

    expect(normalizePreviewText(source)).toBe('First styled idea\nSecond idea\nThird idea');
  });

  it('collapses duplicate newlines without changing a single newline', () => {
    expect(normalizePreviewText('First line\nSecond line\n\n\nThird line')).toBe('First line\nSecond line\nThird line');
  });

  it('truncates normalized text to the per-card limit and adds an ellipsis', () => {
    const source = 'First line\n\nSecond line with more words';
    const preview = getLibraryCardPreview(source, 16);

    expect(preview).toBe('First line\nSeco…');
    expect(Array.from(preview)).toHaveLength(16);
  });

  it('does not append an ellipsis when the normalized text fits', () => {
    expect(getLibraryCardPreview('First\n\nSecond', 12)).toBe('First\nSecond');
  });

  it('enforces the default limit without changing the source content', () => {
    const source = 'x'.repeat(LIBRARY_CARD_PREVIEW_MAX_LENGTH + 20);

    expect(getLibraryCardPreview(source)).toBe(`${'x'.repeat(LIBRARY_CARD_PREVIEW_MAX_LENGTH - 1)}…`);
    expect(source).toHaveLength(LIBRARY_CARD_PREVIEW_MAX_LENGTH + 20);
  });
});
