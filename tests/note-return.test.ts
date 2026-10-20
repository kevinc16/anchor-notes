import { describe, expect, it, vi } from 'vitest';
import { openNoteSource, takeNoteReturn, type NoteReturnApi } from '../lib/note-return';

function fixture() {
  const stored: Record<string, unknown> = {};
  const destinations: string[] = [];
  let nextTabId = 10;
  const api: NoteReturnApi = {
    tabs: {
      async create({ url }) {
        destinations.push(url);
        return { id: nextTabId++ };
      },
      async update(_id, { url }) {
        destinations.push(url);
      },
    },
    session: {
      async get(key) {
        return { [key]: stored[key] };
      },
      async set(values) {
        Object.assign(stored, values);
      },
      async remove(key) {
        delete stored[key];
      },
    },
  };
  return { api, stored, destinations };
}

const note = { id: 'note-a', url: 'https://example.com/article#original-section' };

describe('return-to-source intent', () => {
  it('records only a note ID and expiry before navigating the new tab to the unchanged source URL', async () => {
    const { api, stored, destinations } = fixture();
    const update = api.tabs.update;
    api.tabs.update = async (id, properties) => {
      expect(Object.values(stored)).toEqual([{ id: 'note-a', expiresAt: expect.any(Number) }]);
      await update(id, properties);
    };
    await openNoteSource(api, note);
    expect(destinations).toEqual(['about:blank', 'https://example.com/article#original-section']);
    expect(await takeNoteReturn(api.session, 11)).toBeUndefined();
    expect(await takeNoteReturn(api.session, 10)).toEqual({
      id: 'note-a',
      expiresAt: expect.any(Number),
    });
    expect(await takeNoteReturn(api.session, 10)).toBeUndefined();
    expect(stored).toEqual({});
  });

  it('keeps simultaneous returns to the same source independent', async () => {
    const { api } = fixture();
    await Promise.all([openNoteSource(api, note), openNoteSource(api, { ...note, id: 'note-b' })]);
    expect((await takeNoteReturn(api.session, 10))?.id).toBe('note-a');
    expect((await takeNoteReturn(api.session, 11))?.id).toBe('note-b');
  });

  it('preserves opening a background tab for a modified or middle click', async () => {
    const { api } = fixture();
    const create = vi.spyOn(api.tabs, 'create');
    await openNoteSource(api, note, false);
    expect(create).toHaveBeenCalledWith({ url: 'about:blank', active: false });
  });

  it('discards expired and malformed requests', async () => {
    const { api, stored } = fixture();
    await openNoteSource(api, note);
    const key = Object.keys(stored)[0]!;
    for (const intent of [{ id: 'a', expiresAt: 0 }, { id: 123, expiresAt: Date.now() + 10_000 }, null]) {
      stored[key] = intent;
      expect(await takeNoteReturn(api.session, 10)).toBeUndefined();
      expect(stored).toEqual({});
    }
  });

  it('still opens the source when session storage is unavailable', async () => {
    const { api, destinations } = fixture();
    api.session.set = vi.fn().mockRejectedValue(new Error('Storage unavailable'));
    await openNoteSource(api, note);
    expect(destinations).toEqual(['about:blank', note.url]);
  });

  it('clears an abandoned request when navigation fails', async () => {
    const { api, stored } = fixture();
    api.tabs.update = vi.fn().mockRejectedValue(new Error('Tab closed'));
    await expect(openNoteSource(api, note)).rejects.toThrow('Tab closed');
    expect(stored).toEqual({});
  });
});
