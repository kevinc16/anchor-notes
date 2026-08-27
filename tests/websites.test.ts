import { describe, expect, it } from 'vitest';
import type { AnchorNote } from '../lib/types';
import { groupNotesByWebsite } from '../lib/websites';

function note(id: string, url: string): AnchorNote {
  return {
    id,
    url,
    title: id,
    quote: id,
    body: '',
    anchor: {
      quote: { exact: id, prefix: '', suffix: '' },
      startPath: 'body',
      startOffset: 0,
      endPath: 'body',
      endOffset: id.length,
    },
    pageSnapshot: { description: '', capturedAt: '2026-08-27T00:00:00.000Z' },
    color: 'yellow',
    tags: [],
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
  };
}

describe('groupNotesByWebsite', () => {
  it('groups normalized hostnames while preserving visible-note order', () => {
    const groups = groupNotesByWebsite([
      note('first', 'https://www.example.com/article'),
      note('second', 'https://docs.test.dev/guide'),
      note('third', 'https://example.com/another'),
    ]);

    expect(groups.map((group) => group.website)).toEqual(['example.com', 'docs.test.dev']);
    expect(groups[0]?.notes.map((item) => item.id)).toEqual(['first', 'third']);
  });
});
