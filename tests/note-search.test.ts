import { describe, expect, it, vi } from 'vitest';
import type { AnchorNote } from '../lib/types';

vi.mock('#imports', () => ({ storage: { defineItem: () => ({}) } }));

import { normalizeData, noteMatches } from '../lib/storage';

const note: AnchorNote = {
  id: 'search-note',
  title: 'Article heading',
  url: 'https://example.com/source',
  quote: 'Selected passage',
  body: 'Personal annotation',
  tags: ['research', 'reading'],
  summary: 'Distinctive synthesis of the material.',
  color: 'yellow',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  anchor: {
    quote: { exact: 'Selected passage', prefix: '', suffix: '' },
    startPath: '',
    startOffset: 0,
    endPath: '',
    endOffset: 16,
  },
  pageSnapshot: { description: '', capturedAt: '2026-01-01T00:00:00Z' },
};

describe('local note search', () => {
  it.each(['synthesis', '  DISTINCTIVE SYNTHESIS  ', 'nthes'])('matches summary-only query %j', (query) => {
    expect(noteMatches(note, query)).toBe(true);
  });

  it.each(['heading', 'passage', 'annotation', 'example.com/source', 'research', 'reading'])(
    'preserves matching in existing fields for %j',
    (query) => {
      expect(noteMatches(note, query)).toBe(true);
    },
  );

  it.each(['unrelated', 'synthesis distinctive'])('rejects non-matching query %j', (query) => {
    expect(noteMatches(note, query)).toBe(false);
  });

  it.each(['', '   '])('matches an empty normalized query %j', (query) => {
    expect(noteMatches(note, query)).toBe(true);
  });

  it.each(['missing', 'empty'] as const)('safely searches imported notes with %s summaries', (kind) => {
    const imported = { ...note };
    if (kind === 'missing') delete imported.summary;
    else imported.summary = '';
    const [normalized] = normalizeData({ notes: [imported] }).notes;
    expect(normalized).toBeDefined();
    expect(noteMatches(normalized!, 'synthesis')).toBe(false);
    expect(noteMatches(normalized!, 'undefined')).toBe(false);
    expect(noteMatches(normalized!, 'annotation')).toBe(true);
  });
});
