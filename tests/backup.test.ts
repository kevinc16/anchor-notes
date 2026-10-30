import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../lib/settings';
import { encryptSecret, decryptSecret } from '../lib/secrets';
import type { AnchorData, AnchorNote } from '../lib/types';

const memory = vi.hoisted(() => new Map<string, unknown>());
const clearSession = vi.hoisted(() =>
  vi.fn(async () => {
    memory.delete('session:anchorNotesAiApiKey');
  }),
);
vi.mock('#imports', () => ({
  storage: {
    defineItem: (key: string, options: { defaultValue: unknown }) => ({
      getValue: async () => structuredClone(memory.get(key) ?? options.defaultValue),
      setValue: async (value: unknown) => {
        memory.set(key, structuredClone(value));
      },
      removeValue: clearSession,
    }),
  },
}));
import { readData, writeData } from '../lib/storage';
import { importBackup } from '../lib/backup';

const note = {
  id: 'synthetic-note',
  body: 'Synthetic backup note',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-02',
} as AnchorNote;
const current: AnchorData = {
  schemaVersion: 1,
  notes: [note],
  settings: { ...DEFAULT_SETTINGS, highlightColor: 'mint' },
};
beforeEach(async () => {
  memory.clear();
  clearSession.mockClear();
  await writeData(current);
  memory.set('session:anchorNotesAiApiKey', 'synthetic-session');
});

it('round trips settings and preserves note merge identities and timestamps', async () => {
  const exported = JSON.parse(
    JSON.stringify({ ...current, settings: { ...DEFAULT_SETTINGS, highlightColor: 'coral' } }),
  );
  exported.notes.push({ ...note, id: 'second-note' });
  exported.notes[0].body = 'Imported replacement';
  const result = await importBackup(exported);
  expect(result.settings.highlightColor).toBe('coral');
  expect(result.notes).toEqual(exported.notes);
  expect(clearSession).toHaveBeenCalledOnce();
  expect(memory.has('session:anchorNotesAiApiKey')).toBe(false);
});
it('preserves current preferences and unlocked credentials for note-only backups', async () => {
  const result = await importBackup({ notes: [] });
  expect(result).toEqual(current);
  expect(clearSession).not.toHaveBeenCalled();
});
it('replaces partial settings using defaults and excludes session secrets', async () => {
  const result = await importBackup({
    notes: [],
    settings: { highlightCoverage: 'full', passphrase: 'synthetic', sessionApiKey: 'synthetic' },
  });
  expect(result.settings).toEqual({ ...DEFAULT_SETTINGS, highlightCoverage: 'full' });
});
it.each([null, [], 'invalid', 42])(
  'rejects malformed settings %j before changing notes or credentials',
  async (settings) => {
    await expect(importBackup({ notes: [{ ...note, id: 'new' }], settings })).rejects.toThrow();
    expect(await readData()).toEqual(current);
    expect(clearSession).not.toHaveBeenCalled();
  },
);
it.each([null, [], {}, { notes: null }])('rejects malformed backups %j without writes', async (backup) => {
  await expect(importBackup(backup)).rejects.toThrow();
  expect(await readData()).toEqual(current);
  expect(clearSession).not.toHaveBeenCalled();
});
it('restores encrypted credentials locked, omitting plaintext and unknown credential fields', async () => {
  const encrypted = await encryptSecret('synthetic-key', 'synthetic passphrase');
  const result = await importBackup({
    notes: [],
    settings: { aiApiKey: 'must-not-survive', aiApiKeyEncrypted: { ...encrypted, passphrase: 'must-not-survive' } },
  });
  expect(result.settings.aiApiKey).toBe('');
  expect(result.settings.aiApiKeyEncrypted).toEqual(encrypted);
  expect(await decryptSecret(result.settings.aiApiKeyEncrypted!, 'synthetic passphrase')).toBe('synthetic-key');
  expect(JSON.stringify(result)).not.toContain('must-not-survive');
  expect(memory.has('session:anchorNotesAiApiKey')).toBe(false);
});
it('rejects malformed encrypted credentials without losing current data', async () => {
  await expect(importBackup({ notes: [], settings: { aiApiKeyEncrypted: { version: 2 } } })).rejects.toThrow();
  expect(await readData()).toEqual(current);
  expect(clearSession).not.toHaveBeenCalled();
});
it('does not replace persistent data when session clearing fails', async () => {
  clearSession.mockRejectedValueOnce(new Error('Storage unavailable'));
  await expect(importBackup({ notes: [], settings: {} })).rejects.toThrow('Storage unavailable');
  expect(await readData()).toEqual(current);
});
