import { browser } from '#imports';
import { organizeWithAI } from './organize';
import { saveGeneratedSummary } from './storage';
import type { AnchorNote, AnchorSettings, SummaryGenerationStatus } from './types';

export const SUMMARY_GENERATION_PREFIX = 'anchorNotesSummary:';
const GENERATION_TIMEOUT_MS = 60_000;

export function getSummaryGenerationState(
  value: unknown,
  now = Date.now(),
): SummaryGenerationStatus['state'] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const status = value as Partial<SummaryGenerationStatus>;
  if (status.state === 'unavailable') return 'unavailable';
  if (status.state === 'pending' && typeof status.expiresAt === 'number' && Number.isFinite(status.expiresAt)) {
    return status.expiresAt > now ? 'pending' : 'unavailable';
  }
  return undefined;
}

export async function generateSummary(note: AnchorNote, settings: AnchorSettings): Promise<void> {
  const key = `${SUMMARY_GENERATION_PREFIX}${note.id}`;
  const controller = new AbortController();
  const expiresAt = Date.now() + GENERATION_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
  try {
    await browser.storage.session.set({
      [key]: { state: 'pending', expiresAt } satisfies SummaryGenerationStatus,
    });
    const generated = await organizeWithAI(note, settings, controller.signal);
    // A suspended background must not apply a result after the UI has timed it out.
    if (controller.signal.aborted || Date.now() >= expiresAt) throw new Error('Summary generation timed out.');
    generated.summary = generated.summary.trim();
    const saved = await saveGeneratedSummary(note, generated);
    if (saved && !generated.summary) {
      await browser.storage.session.set({ [key]: { state: 'unavailable' } satisfies SummaryGenerationStatus });
    } else {
      await browser.storage.session.remove(key);
    }
  } catch {
    // Provider errors can contain private content; expose only a generic status.
    await browser.storage.session
      .set({ [key]: { state: 'unavailable' } satisfies SummaryGenerationStatus })
      .catch(() => undefined);
  } finally {
    clearTimeout(timeout);
  }
}
