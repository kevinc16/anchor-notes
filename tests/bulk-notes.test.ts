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
    permissions: { contains: async () => memory.get('consent') === true },
    storage: {
      session: {
        get: async (key: string) => ({ [key]: structuredClone(memory.get(key)) }),
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

import { bulkEditTags, deleteNote, readData, saveNote, updateSettings } from '../lib/storage';
import { startBulkGeneration, getBulkGeneration, BULK_GENERATION_KEY } from '../lib/bulk-generation';

function note(id: string): AnchorNote {
  return {
    id,
    title: 'Example',
    url: 'https://example.com',
    quote: 'Example quote',
    body: 'Original body',
    tags: ['research', 'old'],
    summary: 'Existing summary',
    color: 'yellow',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    anchor: {
      quote: { exact: 'Example quote', prefix: '', suffix: '' },
      startPath: '',
      startOffset: 0,
      endPath: '',
      endOffset: 13,
    },
    pageSnapshot: { description: '', capturedAt: '2026-01-01T00:00:00Z' },
  };
}

beforeEach(() => memory.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('bulk tag patches', () => {
  it.each([
    ['add', ' UI, research, ui ', ['research', 'old', 'ui']],
    ['remove', ' OLD, missing ', ['research']],
    ['replace', ' UI, ui, API ', ['ui', 'api']],
    ['replace', '', []],
  ] as const)(
    '%s normalizes input and preserves unselected notes and other fields',
    async (operation, tags, expected) => {
      await saveNote(note('one'));
      await saveNote(note('two'));
      await saveNote({ ...note('one'), body: 'Latest body', color: 'mint' });
      const result = await bulkEditTags(['one', 'one', 'missing'], operation, tags);
      expect(result).toEqual({ changed: 1, skipped: 1 });
      const data = await readData();
      expect(data.notes.find((n) => n.id === 'one')).toMatchObject({
        tags: [...expected],
        body: 'Latest body',
        summary: 'Existing summary',
        color: 'mint',
        createdAt: '2026-01-01T00:00:00Z',
      });
      expect(data.notes.find((n) => n.id === 'two')).toEqual(note('two'));
    },
  );

  it('does not recreate deleted notes or change timestamps for no-op patches', async () => {
    await saveNote(note('one'));
    await saveNote(note('two'));
    await deleteNote('two');
    expect(await bulkEditTags(['one', 'two'], 'add', 'research')).toEqual({ changed: 0, skipped: 1 });
    expect((await readData()).notes).toEqual([note('one')]);
  });

  it('serializes concurrent patches against the latest tag values', async () => {
    await saveNote(note('one'));
    await Promise.all([bulkEditTags(['one'], 'add', 'a'), bulkEditTags(['one'], 'add', 'b')]);
    expect((await readData()).notes[0]?.tags).toEqual(['research', 'old', 'a', 'b']);
  });
});

async function enableAI() {
  await updateSettings({
    ...DEFAULT_SETTINGS,
    aiEnabled: true,
    aiProvider: 'custom',
    aiEndpoint: 'https://example.com/v1/chat/completions',
  });
}
function completion() {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify({ tags: ['ai'], summary: 'New summary' }) } }] }),
  );
}

describe('bulk generation', () => {
  it('sends the same guidance independently to selected notes without storing it', async () => {
    await enableAI();
    for (const id of ['one', 'two', 'unselected']) await saveNote({ ...note(id), quote: `Quote ${id}` });
    const contexts: Array<Record<string, string>> = [];
    vi.stubGlobal('fetch', async (_url: string, request: RequestInit) => {
      contexts.push(JSON.parse(JSON.parse(request.body as string).messages[1].content));
      return completion();
    });
    const prompt = 'Emphasize practical takeaways and browser extension tags';
    await startBulkGeneration(['one', 'two'], prompt);
    await vi.waitFor(async () =>
      expect((await getBulkGeneration())?.items.map((i) => i.state)).toEqual(['completed', 'completed']),
    );
    expect(contexts).toHaveLength(2);
    expect(contexts.map((context) => context.quote).sort()).toEqual(['Quote one', 'Quote two']);
    for (const context of contexts) {
      expect(context.guidance).toBe(prompt);
      expect(context.note).toBe('Original body');
      expect(JSON.stringify(context)).not.toContain('unselected');
    }
    const data = await readData();
    expect(data.notes.find((n) => n.id === 'unselected')).toEqual({ ...note('unselected'), quote: 'Quote unselected' });
    for (const id of ['one', 'two'])
      expect(data.notes.find((n) => n.id === id)).toMatchObject({ quote: `Quote ${id}`, body: 'Original body' });
    expect(JSON.stringify([...memory])).not.toContain(prompt);
  });

  it('rejects malformed guidance without sending requests or exposing its contents', async () => {
    await expect(startBulkGeneration(['one'], { private: 'sensitive' } as never)).rejects.toThrow(
      'Enter a valid optional prompt.',
    );
  });

  it('requires enabled AI and unlocked credentials before sending any notes', async () => {
    await saveNote(note('one'));
    let requests = 0;
    vi.stubGlobal('fetch', async () => {
      requests++;
      return completion();
    });
    await expect(startBulkGeneration(['one'])).rejects.toThrow(/Settings/);
    await enableAI();
    await updateSettings({ aiApiKeyEncrypted: { version: 1 } as never });
    await expect(startBulkGeneration(['one'])).rejects.toThrow(/Unlock/);
    expect(requests).toBe(0);
    expect((await readData()).notes[0]).toEqual(note('one'));
  });

  it('limits concurrency, rejects overlapping batches, preserves failures, and skips deleted queued notes', async () => {
    await enableAI();
    for (const id of ['one', 'two', 'three', 'four']) await saveNote(note(id));
    const finishes: Array<(response: Response) => void> = [];
    vi.stubGlobal('fetch', () => new Promise<Response>((resolve) => finishes.push(resolve)));
    const batch = await startBulkGeneration(['one', 'two', 'three', 'four', 'one', 'missing'], 'Focus on research');
    expect(batch.items).toHaveLength(5);
    await vi.waitFor(() => expect(finishes).toHaveLength(2));
    await expect(startBulkGeneration(['three'])).rejects.toThrow(/already/);
    await deleteNote('three');
    finishes[0]!(completion());
    await vi.waitFor(() => expect(finishes).toHaveLength(3));
    finishes[1]!(new Response('', { status: 503 }));
    finishes[2]!(completion());
    await vi.waitFor(async () =>
      expect((await getBulkGeneration())?.items.map((i) => i.state)).toEqual([
        'completed',
        'failed',
        'skipped',
        'completed',
        'skipped',
      ]),
    );
    expect((await readData()).notes.find((n) => n.id === 'two')).toEqual(note('two'));
    const retry = await startBulkGeneration(['two']);
    await vi.waitFor(() => expect(finishes).toHaveLength(4));
    finishes[3]!(completion());
    await vi.waitFor(async () =>
      expect((await getBulkGeneration())?.items).toEqual([{ id: 'two', state: 'completed' }]),
    );
    expect(retry.items).toHaveLength(1);
    expect((await readData()).notes.find((n) => n.id === 'two')?.summary).toBe('New summary');
  });

  it('does not overwrite a manual edit while a response is pending', async () => {
    await enableAI();
    await saveNote(note('one'));
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    await startBulkGeneration(['one'], 'Focus on practical takeaways');
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await bulkEditTags(['one'], 'replace', 'manual');
    finish(completion());
    await vi.waitFor(async () => expect((await getBulkGeneration())?.items[0]?.state).toBe('skipped'));
    expect((await readData()).notes[0]).toMatchObject({ tags: ['manual'], summary: 'Existing summary' });
  });

  it('marks unfinished session work as failed after a background restart', async () => {
    memory.set(BULK_GENERATION_KEY, {
      id: 'old',
      expiresAt: Date.now() + 60_000,
      items: [
        { id: 'one', state: 'completed' },
        { id: 'two', state: 'pending' },
        { id: 'three', state: 'queued' },
      ],
    });
    expect((await getBulkGeneration())?.items.map((i) => i.state)).toEqual(['completed', 'failed', 'failed']);
  });
});

it('requires Firefox consent before regeneration and allows it after consent', async () => {
  vi.stubEnv('FIREFOX', 'true');
  await enableAI();
  await saveNote(note('one'));
  let requests = 0;
  vi.stubGlobal('fetch', async () => {
    requests++;
    return completion();
  });
  await expect(startBulkGeneration(['one'])).rejects.toThrow(/consent/);
  expect(requests).toBe(0);
  memory.set('consent', true);
  await startBulkGeneration(['one']);
  await vi.waitFor(async () => expect((await getBulkGeneration())?.items[0]?.state).toBe('completed'));
  expect(requests).toBe(1);
});

it.each(['disabled', 'locked', 'consent', 'missing-key'])(
  'rechecks %s gates before sending queued notes',
  async (gate) => {
    await enableAI();
    if (gate === 'consent') {
      vi.stubEnv('FIREFOX', 'true');
      memory.set('consent', true);
    }
    if (gate === 'missing-key') await updateSettings({ aiProvider: 'openrouter', aiApiKey: 'test-key' });
    for (const id of ['one', 'two', 'three']) await saveNote(note(id));
    const finishes: Array<(response: Response) => void> = [];
    vi.stubGlobal('fetch', () => new Promise<Response>((resolve) => finishes.push(resolve)));
    await startBulkGeneration(['one', 'two', 'three']);
    await vi.waitFor(() => expect(finishes).toHaveLength(2));
    if (gate === 'disabled') await updateSettings({ aiEnabled: false });
    if (gate === 'locked') await updateSettings({ aiApiKeyEncrypted: { version: 1 } as never });
    if (gate === 'consent') memory.set('consent', false);
    if (gate === 'missing-key') await updateSettings({ aiApiKey: '' });
    finishes[0]!(completion());
    finishes[1]!(completion());
    await vi.waitFor(async () =>
      expect((await getBulkGeneration())?.items.map((i) => i.state)).toEqual(['completed', 'completed', 'failed']),
    );
    expect(finishes).toHaveLength(2);
    expect((await readData()).notes.find((n) => n.id === 'three')).toEqual(note('three'));
  },
);
