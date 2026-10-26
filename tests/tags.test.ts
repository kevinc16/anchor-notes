import { describe, expect, it } from 'vitest';
import { getLibraryTags, parseTags } from '../lib/tags';

describe('parseTags', () => {
  it('normalizes, removes empty values, and de-duplicates tags in input order', () => {
    expect(parseTags(' Research, design, RESEARCH, , Reading ')).toEqual(['research', 'design', 'reading']);
  });

  it('allows every tag to be removed', () => {
    expect(parseTags(' ,  ')).toEqual([]);
  });
});

describe('library tags', () => {
  it('exposes every tag, ordered by use count then alphabetically', () => {
    const tags = Array.from({ length: 12 }, (_, index) => `tag-${String(index).padStart(2, '0')}`);
    const notes = tags.map((tag) => ({ tags: [tag] }));
    expect(getLibraryTags([...notes, { tags: ['tag-11'] }])).toEqual(['tag-11', ...tags.slice(0, 11)]);
    expect(getLibraryTags([])).toEqual([]);
  });
});
