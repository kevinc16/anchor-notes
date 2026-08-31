import { describe, expect, it } from 'vitest';
import { parseTags } from '../lib/tags';

describe('parseTags', () => {
  it('normalizes, removes empty values, and de-duplicates tags in input order', () => {
    expect(parseTags(' Research, design, RESEARCH, , Reading ')).toEqual([
      'research',
      'design',
      'reading',
    ]);
  });

  it('allows every tag to be removed', () => {
    expect(parseTags(' ,  ')).toEqual([]);
  });
});
