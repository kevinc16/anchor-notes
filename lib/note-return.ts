import type { AnchorNote, NoteReturnIntent } from './types';

export interface NoteReturnApi {
  tabs: {
    create(properties: { url: string; active?: boolean }): Promise<{ id?: number }>;
    update(id: number, properties: { url: string }): Promise<unknown>;
  };
  session: {
    get(key: string): Promise<Record<string, unknown>>;
    set(values: Record<string, unknown>): Promise<void>;
    remove(key: string): Promise<void>;
  };
}

export const noteReturnKey = (tabId: number) => `anchorNotesReturn:${tabId}`;

export async function openNoteSource(
  api: NoteReturnApi,
  note: Pick<AnchorNote, 'id' | 'url'>,
  active = true,
): Promise<void> {
  // Store the intent before loading the source, even if its content script starts immediately.
  const tab = await api.tabs.create({ url: 'about:blank', active });
  if (tab.id === undefined) throw new Error('Could not open the source tab.');
  const key = noteReturnKey(tab.id);
  try {
    await api.session.set({ [key]: { id: note.id, expiresAt: Date.now() + 5 * 60_000 } satisfies NoteReturnIntent });
  } catch {
    // Navigation still works when temporary storage is unavailable.
  }
  try {
    await api.tabs.update(tab.id, { url: note.url });
  } catch (error) {
    await api.session.remove(key).catch(() => undefined);
    throw error;
  }
}

export async function takeNoteReturn(
  session: NoteReturnApi['session'],
  tabId: number,
): Promise<NoteReturnIntent | undefined> {
  const key = noteReturnKey(tabId);
  const value = (await session.get(key))[key] as Partial<NoteReturnIntent> | null | undefined;
  if (value === undefined) return undefined;
  await session.remove(key);
  if (
    value &&
    typeof value.id === 'string' &&
    value.id &&
    typeof value.expiresAt === 'number' &&
    Number.isFinite(value.expiresAt) &&
    value.expiresAt > Date.now()
  ) {
    return { id: value.id, expiresAt: value.expiresAt };
  }
  return undefined;
}
