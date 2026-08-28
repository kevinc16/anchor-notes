import { describe, expect, it } from 'vitest';
import { applyLibraryNoteEdits } from '../lib/note-edits';
import type { AnchorNote } from '../lib/types';

function note(summary?: string): AnchorNote {
  return {
    id: 'note-1',
    url: 'https://example.com/article',
    title: 'Example',
    quote: 'A saved passage',
    body: 'Original note',
    anchor: {
      quote: { exact: 'A saved passage', prefix: '', suffix: '' },
      startPath: 'body',
      startOffset: 0,
      endPath: 'body',
      endOffset: 15,
    },
    pageSnapshot: { description: '', capturedAt: '2026-08-28T00:00:00.000Z' },
    color: 'yellow',
    tags: ['original'],
    summary,
    createdAt: '2026-08-28T00:00:00.000Z',
    updatedAt: '2026-08-28T00:00:00.000Z',
  };
}

describe('applyLibraryNoteEdits', () => {
  it('replaces an existing LLM-generated summary', () => {
    const original = note('Generated summary');
    const updated = applyLibraryNoteEdits(original, {
      body: original.body,
      summary: '  Edited by the user  ',
      tags: original.tags.join(', '),
      color: original.color,
      highlightCoverage: 'medium',
    });

    expect(updated.summary).toBe('Edited by the user');
    expect(original.summary).toBe('Generated summary');
  });

  it('adds a manual summary to a note without one', () => {
    const updated = applyLibraryNoteEdits(note(), {
      body: 'Updated body',
      summary: 'Manual summary',
      tags: 'Research, Reading',
      color: 'mint',
      highlightCoverage: 'small',
    });

    expect(updated).toMatchObject({
      body: 'Updated body',
      summary: 'Manual summary',
      tags: ['research', 'reading'],
      color: 'mint',
      highlightCoverage: 'small',
    });
  });

  it('removes the optional summary when the field is cleared', () => {
    const updated = applyLibraryNoteEdits(note('Generated summary'), {
      body: 'Original note',
      summary: '   ',
      tags: 'original',
      color: 'yellow',
      highlightCoverage: 'full',
    });

    expect(updated).not.toHaveProperty('summary');
    expect(updated.highlightCoverage).toBe('full');
  });
});
