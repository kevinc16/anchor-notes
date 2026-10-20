import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../lib/settings';
import type { AnchorNote } from '../lib/types';

const memory = vi.hoisted(() => new Map<string, unknown>());
vi.mock('#imports', () => ({
  storage: {
    defineItem: (key: string, options: { defaultValue: unknown }) => ({
      getValue: async () => structuredClone(memory.get(key) ?? options.defaultValue),
      setValue: async (value: unknown) => {
        memory.set(key, structuredClone(value));
      },
    }),
  },
  browser: {
    storage: {
      session: {
        set: async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) memory.set(key, structuredClone(value));
        },
        remove: async (key: string) => {
          memory.delete(key);
        },
      },
    },
  },
}));

import { deleteNote, readData, saveNote } from '../lib/storage';
import { generateSummary, getSummaryGenerationState, SUMMARY_GENERATION_PREFIX } from '../lib/summary-generation';

const settings = {
  ...DEFAULT_SETTINGS,
  aiEnabled: true,
  aiProvider: 'custom' as const,
  aiEndpoint: 'https://example.com/v1/chat/completions',
};
function note(id = 'first'): AnchorNote {
  return {
    id,
    url: 'https://example.com/article',
    title: 'Example',
    quote: 'A sample quote.',
    body: '',
    anchor: {
      quote: { exact: 'A sample quote.', prefix: '', suffix: '' },
      startPath: '',
      startOffset: 0,
      endPath: '',
      endOffset: 15,
    },
    pageSnapshot: { description: '', capturedAt: '2026-10-20T00:00:00Z' },
    color: 'yellow',
    tags: ['example'],
    createdAt: '2026-10-20T00:00:00Z',
    updatedAt: '2026-10-20T00:00:00Z',
  };
}
function completion(summary = 'Generated summary') {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify({ summary, tags: ['ai'] }) } }] }),
  );
}
function delayedProvider() {
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  return (response = completion()) => finish(response);
}
function status(id = 'first') {
  return memory.get(`${SUMMARY_GENERATION_PREFIX}${id}`);
}

beforeEach(() => memory.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('summary generation', () => {
  it('exposes pending status, then saves the summary and clears the status', async () => {
    const original = note();
    await saveNote(original);
    const finish = delayedProvider();
    const generating = generateSummary(original, settings);
    await vi.waitFor(() => expect(getSummaryGenerationState(status())).toBe('pending'));
    expect((await readData()).notes[0]?.tags).toEqual(['example']);
    finish();
    await generating;
    expect((await readData()).notes[0]).toMatchObject({ summary: 'Generated summary', tags: ['ai'] });
    expect(status()).toBeUndefined();
  });

  it('accepts browser storage reordering object properties', async () => {
    const original = note();
    await saveNote(original);
    const stored = memory.get('local:anchorNotesData') as { notes: AnchorNote[] };
    stored.notes[0] = Object.fromEntries(
      Object.entries(original).sort(([a], [b]) => a.localeCompare(b)),
    ) as unknown as AnchorNote;
    memory.set('local:anchorNotesData', stored);
    vi.stubGlobal('fetch', async () => completion());
    await generateSummary(original, settings);
    expect((await readData()).notes[0]?.summary).toBe('Generated summary');
  });

  it.each(['error', 'malformed', 'empty'])(
    'ends loading after an %s result without losing the note',
    async (result) => {
      const original = note();
      await saveNote(original);
      vi.stubGlobal('fetch', async () =>
        result === 'error'
          ? new Response('', { status: 503 })
          : result === 'malformed'
            ? new Response('{}')
            : completion('  '),
      );
      await generateSummary(original, settings);
      expect((await readData()).notes).toHaveLength(1);
      expect(getSummaryGenerationState(status())).toBe('unavailable');
      expect(JSON.stringify(status())).not.toContain('example.com');
    },
  );

  it('aborts a stalled request and ends loading', async () => {
    vi.useFakeTimers();
    const original = note();
    await saveNote(original);
    let aborted = false;
    vi.stubGlobal(
      'fetch',
      (_url: string, request: RequestInit) =>
        new Promise((_resolve, reject) => {
          request.signal?.addEventListener('abort', () => {
            aborted = true;
            reject(new Error('aborted'));
          });
        }),
    );
    const generating = generateSummary(original, settings);
    await vi.advanceTimersByTimeAsync(120_000);
    await generating;
    expect(aborted).toBe(true);
    expect(getSummaryGenerationState(status())).toBe('unavailable');
    expect((await readData()).notes[0]?.id).toBe(original.id);
  });

  it.each(['edit', 'delete'])('ignores a late result after a manual %s', async (action) => {
    const original = note();
    await saveNote(original);
    const finish = delayedProvider();
    const generating = generateSummary(original, settings);
    await vi.waitFor(() => expect(getSummaryGenerationState(status())).toBe('pending'));
    if (action === 'edit') await saveNote({ ...original, summary: 'My summary', body: 'My edit' });
    else await deleteNote(original.id);
    finish();
    await generating;
    const notes = (await readData()).notes;
    if (action === 'edit')
      expect(notes[0]).toMatchObject({ summary: 'My summary', body: 'My edit', tags: ['example'] });
    else expect(notes).toEqual([]);
    expect(status()).toBeUndefined();
  });

  it('keeps simultaneous saves and generation results independent', async () => {
    const first = note();
    const second = note('second');
    await Promise.all([saveNote(first), saveNote(second)]);
    const finishes: Array<(response: Response) => void> = [];
    vi.stubGlobal('fetch', () => new Promise<Response>((resolve) => finishes.push(resolve)));
    const one = generateSummary(first, settings);
    const two = generateSummary(second, settings);
    await vi.waitFor(() => expect(finishes).toHaveLength(2));
    finishes[0]!(completion('First summary'));
    await one;
    expect(status()).toBeUndefined();
    expect(getSummaryGenerationState(status('second'))).toBe('pending');
    finishes[1]!(completion('Second summary'));
    await two;
    expect((await readData()).notes.map(({ id, summary }) => ({ id, summary }))).toEqual([
      { id: 'second', summary: 'Second summary' },
      { id: 'first', summary: 'First summary' },
    ]);
  });
});

describe('generation status', () => {
  it('does not infer loading for old notes and treats expired requests as unavailable', () => {
    expect(getSummaryGenerationState(undefined, 100)).toBeUndefined();
    expect(getSummaryGenerationState({ state: 'pending', expiresAt: 101 }, 100)).toBe('pending');
    expect(getSummaryGenerationState({ state: 'pending', expiresAt: 100 }, 100)).toBe('unavailable');
    expect(getSummaryGenerationState({ state: 'pending' }, 100)).toBeUndefined();
    expect(getSummaryGenerationState({ state: 'pending', expiresAt: Infinity }, 100)).toBeUndefined();
  });
});
