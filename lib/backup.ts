import { clearSessionApiKey } from './credentials';
import { normalizeSettings } from './settings';
import { readData, writeData } from './storage';
import type { AnchorData } from './types';

// Validate the entire backup before changing persistent data or session credentials.
export async function importBackup(value: unknown): Promise<AnchorData> {
  if (!value || typeof value !== 'object' || !Array.isArray((value as Partial<AnchorData>).notes)) {
    throw new Error('This backup does not contain a notes array.');
  }
  const incoming = value as Partial<AnchorData>;
  const hasSettings = Object.hasOwn(incoming, 'settings');
  if (
    hasSettings &&
    (!incoming.settings || typeof incoming.settings !== 'object' || Array.isArray(incoming.settings))
  ) {
    throw new Error('This backup contains invalid settings.');
  }
  const settings = hasSettings ? normalizeSettings(incoming.settings) : undefined;
  if (incoming.settings?.aiApiKeyEncrypted != null && !settings?.aiApiKeyEncrypted) {
    throw new Error('This backup contains an invalid encrypted credential.');
  }
  const data = await readData();
  const byId = new Map([...data.notes, ...incoming.notes!].map((note) => [note.id, note]));
  if (settings) await clearSessionApiKey();
  return writeData({ ...data, notes: [...byId.values()], settings: settings ?? data.settings });
}
