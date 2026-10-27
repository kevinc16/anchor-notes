import { storage } from '#imports';
import { DEFAULT_SETTINGS, normalizeSettings } from './settings';
import type { AnchorData, AnchorNote, AnchorSettings, TagOperation } from './types';
import { parseTags } from './tags';

export { hostFromUrl, normalizeUrl } from './websites';

export const EMPTY_DATA: AnchorData = {
  schemaVersion: 1,
  notes: [],
  settings: DEFAULT_SETTINGS,
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

// Background note mutations share one queue so concurrent LLM completions and
// manual edits cannot overwrite one another's read-modify-write operations.
let noteMutation = Promise.resolve();

function mutateNotes(change: (notes: AnchorNote[]) => AnchorNote[] | undefined): Promise<void> {
  const result = noteMutation.then(async () => {
    const data = await readData();
    const notes = change(data.notes);
    if (notes) await writeData({ ...data, notes });
  });
  noteMutation = result.catch(() => undefined);
  return result;
}

export async function saveNote(note: AnchorNote): Promise<AnchorNote> {
  await mutateNotes((notes) => {
    const index = notes.findIndex((item) => item.id === note.id);
    if (index >= 0) {
      const existing = notes[index];
      if (existing) notes[index] = { ...existing, ...note, updatedAt: new Date().toISOString() };
    } else {
      notes.unshift(note);
    }
    return notes;
  });
  return note;
}

export async function saveGeneratedSummary(
  original: AnchorNote,
  generated: Pick<AnchorNote, 'summary' | 'tags'>,
): Promise<boolean> {
  let saved = false;
  await mutateNotes((notes) => {
    const index = notes.findIndex((note) => note.id === original.id);
    const current = notes[index];
    // Storage can reorder object properties. Compare generation inputs and editable
    // fields by value, including edits made within the same millisecond.
    const fields = ['updatedAt', 'quote', 'title', 'url', 'body', 'summary', 'color'] as const;
    if (
      !current ||
      fields.some((field) => current[field] !== original[field]) ||
      JSON.stringify(current.tags) !== JSON.stringify(original.tags)
    )
      return;
    notes[index] = { ...current, ...generated, updatedAt: new Date().toISOString() };
    saved = true;
    return notes;
  });
  return saved;
}

export async function deleteNote(id: string): Promise<void> {
  await mutateNotes((notes) => notes.filter((note) => note.id !== id));
}

export async function bulkEditTags(ids: string[], operation: TagOperation, input: string) {
  const selected = new Set(ids);
  const tags = parseTags(input);
  let changed = 0;
  let found = 0;
  await mutateNotes((notes) => {
    const next = notes.map((note) => {
      if (!selected.has(note.id)) return note;
      found++;
      const updated =
        operation === 'replace'
          ? tags
          : operation === 'remove'
            ? note.tags.filter((tag) => !tags.includes(tag))
            : [...new Set([...note.tags, ...tags])];
      if (JSON.stringify(updated) === JSON.stringify(note.tags)) return note;
      changed++;
      return { ...note, tags: updated, updatedAt: new Date().toISOString() };
    });
    return changed ? next : undefined;
  });
  return { changed, skipped: selected.size - found };
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
  return {
    schemaVersion: 1,
    notes: Array.isArray(candidate.notes) ? candidate.notes : [],
    settings: normalizeSettings(candidate.settings),
  };
}

export function noteMatches(note: AnchorNote, query: string): boolean {
  const haystack = [note.quote, note.body, note.title, note.url, ...note.tags, note.summary].join(' ').toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}
