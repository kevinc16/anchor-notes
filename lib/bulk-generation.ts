import { browser } from '#imports';
import { isEncryptedCredentialLocked } from './credential-settings';
import { readSessionApiKey } from './credentials';
import { FIREFOX_REMOTE_DATA_COLLECTION } from './firefox-permissions';
import { shouldUseAiOrganizer } from './settings';
import { readData } from './storage';
import { generateSummary, SUMMARY_GENERATION_PREFIX } from './summary-generation';
import type { AnchorNote, AnchorSettings, BulkGeneration } from './types';

export const BULK_GENERATION_KEY = 'anchorNotesBulkGeneration';
export const isBulkGenerationActive = (batch: BulkGeneration | undefined) =>
  Boolean(batch?.items.some((item) => item.state === 'queued' || item.state === 'pending'));

let running: BulkGeneration | undefined;
let starting = false;

export async function getBulkGeneration(): Promise<BulkGeneration | undefined> {
  if (running) return structuredClone(running);
  const stored = await browser.storage.session.get(BULK_GENERATION_KEY);
  const batch = stored[BULK_GENERATION_KEY] as BulkGeneration | undefined;
  if (isBulkGenerationActive(batch) && batch) {
    // A new background instance cannot resume its predecessor's in-memory requests.
    const interrupted = batch.items.filter((item) => item.state === 'queued' || item.state === 'pending');
    interrupted.forEach((item) => {
      item.state = 'failed';
    });
    await browser.storage.session.set({ [BULK_GENERATION_KEY]: batch });
    await Promise.all(
      interrupted.map((item) => browser.storage.session.remove(`${SUMMARY_GENERATION_PREFIX}${item.id}`)),
    );
  }
  return batch;
}

async function resolveGenerationSettings(settings: AnchorSettings): Promise<AnchorSettings> {
  if (!shouldUseAiOrganizer(settings)) throw new Error('Enable an LLM provider in Settings first.');
  const sessionApiKey = await readSessionApiKey();
  if (isEncryptedCredentialLocked(settings, sessionApiKey)) {
    throw new Error('Unlock your encrypted API key in Settings first.');
  }
  settings = { ...settings, aiApiKey: sessionApiKey || settings.aiApiKey };
  if (settings.aiProvider === 'openrouter' && !settings.aiApiKey)
    throw new Error('Add an OpenRouter API key in Settings first.');
  if (!settings.aiModel.trim() || !/^https?:\/\//i.test(settings.aiEndpoint))
    throw new Error('Configure the model and endpoint in Settings first.');
  if (import.meta.env.FIREFOX) {
    const permissions = browser.permissions as unknown as {
      contains(details: { data_collection: readonly string[] }): Promise<boolean>;
    };
    const allowed = await permissions.contains({ data_collection: FIREFOX_REMOTE_DATA_COLLECTION }).catch(() => false);
    if (!allowed) throw new Error('Enable Firefox remote-data consent in Settings first.');
  }
  return settings;
}

export async function startBulkGeneration(ids: string[]): Promise<BulkGeneration> {
  if (starting || running) throw new Error('A regeneration batch is already running. Wait for it to finish.');
  starting = true;
  try {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) throw new Error('Select at least one note.');
    const data = await readData();
    await resolveGenerationSettings(data.settings);
    await getBulkGeneration();
    const batch: BulkGeneration = {
      id: crypto.randomUUID(),
      expiresAt: Date.now() + Math.ceil(uniqueIds.length / 2) * 65_000 + 10_000,
      items: uniqueIds.map((id) => ({ id, state: 'queued' })),
    };
    // Keep only IDs and outcomes in session storage, never note text or provider settings.
    running = batch;
    await browser.storage.session.set({ [BULK_GENERATION_KEY]: batch });
    const snapshot = structuredClone(batch);
    void runBatch(batch, data.notes).finally(() => {
      running = undefined;
    });
    return snapshot;
  } catch (error) {
    running = undefined;
    throw error;
  } finally {
    starting = false;
  }
}

async function runBatch(batch: BulkGeneration, originals: AnchorNote[]): Promise<void> {
  const notes = new Map(originals.map((note) => [note.id, note]));
  let index = 0;
  let publishing = Promise.resolve();
  function publish() {
    const snapshot = structuredClone(batch);
    publishing = publishing
      .catch(() => undefined)
      .then(() => browser.storage.session.set({ [BULK_GENERATION_KEY]: snapshot }));
    return publishing;
  }
  async function worker() {
    for (let item = batch.items[index++]; item; item = batch.items[index++]) {
      try {
        const original = notes.get(item.id);
        const data = await readData();
        const current = data.notes.find((note) => note.id === item.id);
        if (!original || !current || current.updatedAt !== original.updatedAt) {
          item.state = 'skipped';
        } else {
          item.state = 'pending';
          await publish();
          const settings = await resolveGenerationSettings((await readData()).settings);
          item.state = await generateSummary(original, settings, true);
        }
      } catch {
        item.state = 'failed';
      }
      // A session-storage failure must not leave an unhandled background promise.
      await publish().catch(() => undefined);
    }
  }
  await Promise.all([worker(), worker()]);
}
