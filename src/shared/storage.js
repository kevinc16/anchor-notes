export const STORAGE_KEY = "anchorNotesData";

export const EMPTY_DATA = {
  schemaVersion: 1,
  notes: [],
  settings: {
    highlightColor: "yellow",
    aiMode: "local",
    aiEndpoint: "https://api.openai.com/v1/chat/completions",
    aiModel: "gpt-4o-mini",
    aiApiKey: ""
  }
};

export async function readData() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeData(result[STORAGE_KEY]);
}

export async function writeData(data) {
  const normalized = normalizeData(data);
  await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
  return normalized;
}

export async function saveNote(note) {
  const data = await readData();
  const index = data.notes.findIndex((item) => item.id === note.id);
  if (index >= 0) data.notes[index] = { ...data.notes[index], ...note, updatedAt: new Date().toISOString() };
  else data.notes.unshift(note);
  await writeData(data);
  return note;
}

export async function deleteNote(id) {
  const data = await readData();
  data.notes = data.notes.filter((note) => note.id !== id);
  await writeData(data);
}

export async function updateSettings(patch) {
  const data = await readData();
  data.settings = { ...data.settings, ...patch };
  await writeData(data);
  return data.settings;
}

export function normalizeData(value) {
  if (!value || typeof value !== "object") return structuredClone(EMPTY_DATA);
  return {
    schemaVersion: 1,
    notes: Array.isArray(value.notes) ? value.notes : [],
    settings: { ...EMPTY_DATA.settings, ...(value.settings || {}) }
  };
}

export function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown source";
  }
}

export function noteMatches(note, query) {
  const haystack = [note.quote, note.body, note.title, note.url, ...(note.tags || [])]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

