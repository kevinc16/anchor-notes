import { storage } from '#imports';
import type { AnchorData, AnchorNote, AnchorSettings } from './types';

export { hostFromUrl } from './websites';

export const EMPTY_DATA: AnchorData = {
  schemaVersion: 1,
  notes: [],
  settings: {
    highlightColor: 'yellow',
    aiProvider: 'local',
    aiEndpoint: 'https://api.openai.com/v1/chat/completions',
    aiModel: 'gpt-4o-mini',
    aiApiKey: '',
  },
};

const dataItem = storage.defineItem<AnchorData>('local:anchorNotesData', {
  defaultValue: EMPTY_DATA,
});

export async function readData(): Promise<AnchorData> {
  return normalizeData(await dataItem.getValue());
}

export async function writeData(data: AnchorData): Promise<AnchorData> {
  const normalized = normalizeData(data);
  await dataItem.setValue(normalized);
  return normalized;
}

export async function saveNote(note: AnchorNote): Promise<AnchorNote> {
  const data = await readData();
  const index = data.notes.findIndex((item) => item.id === note.id);
  if (index >= 0) {
    const existing = data.notes[index];
    if (existing) data.notes[index] = { ...existing, ...note, updatedAt: new Date().toISOString() };
  } else {
    data.notes.unshift(note);
  }
  await writeData(data);
  return note;
}

export async function deleteNote(id: string): Promise<void> {
  const data = await readData();
  data.notes = data.notes.filter((note) => note.id !== id);
  await writeData(data);
}

export async function updateSettings(patch: Partial<AnchorSettings>): Promise<AnchorSettings> {
  const data = await readData();
  data.settings = { ...data.settings, ...patch };
  await writeData(data);
  return data.settings;
}

export function normalizeData(value: unknown): AnchorData {
  if (!value || typeof value !== 'object') return structuredClone(EMPTY_DATA);
  const candidate = value as Partial<AnchorData>;
  const legacySettings = (candidate.settings ?? {}) as Partial<AnchorSettings> & { aiMode?: 'local' | 'remote' };
  const { aiMode, ...currentSettings } = legacySettings;
  const aiProvider = currentSettings.aiProvider
    ?? (aiMode === 'remote' ? 'custom' : 'local');
  return {
    schemaVersion: 1,
    notes: Array.isArray(candidate.notes) ? candidate.notes : [],
    settings: { ...EMPTY_DATA.settings, ...currentSettings, aiProvider },
  };
}

export function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.href.replace(/\/$/, '');
  } catch {
    return value;
  }
}

export function noteMatches(note: AnchorNote, query: string): boolean {
  const haystack = [note.quote, note.body, note.title, note.url, ...note.tags]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}
