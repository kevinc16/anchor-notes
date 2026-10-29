import { browser } from '#imports';
import { useState } from 'react';
import { isBulkGenerationActive } from '@/lib/bulk-generation';
import { parseTags } from '@/lib/tags';
import type { BulkGeneration, ExtensionMessage, MessageResponse, TagOperation } from '@/lib/types';

const buttonClass =
  'inline-flex min-h-9 items-center justify-center rounded-full border border-line bg-card px-4 text-xs font-bold text-ink transition hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:pointer-events-none disabled:opacity-50';
const fieldClass =
  'rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink outline-none focus:border-stone-400 focus:ring-3 focus:ring-stone-200/60';

export function BulkActions({
  selecting,
  ids,
  matchingIds,
  batch,
  onSelect,
}: {
  selecting: boolean;
  ids: string[];
  matchingIds: string[];
  batch?: BulkGeneration;
  onSelect: (ids: string[]) => void;
}) {
  const [operation, setOperation] = useState<TagOperation>('add');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const running = isBulkGenerationActive(batch);
  const failedIds = batch?.items.filter((item) => item.state === 'failed').map((item) => item.id) ?? [];

  async function applyTags() {
    setBusy(true);
    setError('');
    setResult('');
    try {
      const response = (await browser.runtime.sendMessage({
        type: 'BULK_EDIT_TAGS',
        ids,
        operation,
        tags,
      } satisfies ExtensionMessage)) as MessageResponse;
      if (!response?.ok || !response.tagResult) throw new Error(response?.error || 'Could not update tags.');
      setResult(`${response.tagResult.changed} notes updated · ${response.tagResult.skipped} missing notes skipped`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not update tags.');
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(noteIds: string[]) {
    setBusy(true);
    setError('');
    setResult('');
    try {
      const response = (await browser.runtime.sendMessage({
        type: 'START_BULK_GENERATION',
        ids: noteIds,
      } satisfies ExtensionMessage)) as MessageResponse;
      if (!response?.ok) throw new Error(response?.error || 'Could not start regeneration.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not start regeneration.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Bulk note actions" className="mb-6 grid gap-4 rounded-2xl border border-line bg-card p-5">
      {failedIds.length > 0 && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          <p className="font-bold">
            Could not regenerate {failedIds.length} note{failedIds.length === 1 ? '' : 's'}.
          </p>
          <p className="mt-1">
            Existing tags and summaries were kept for failed notes. Check your provider settings and use Retry failed
            notes to try again.
          </p>
        </div>
      )}
      {selecting && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <strong className="mr-auto text-sm">{ids.length} selected</strong>
            <button
              className={buttonClass}
              type="button"
              onClick={() => onSelect(matchingIds)}
              disabled={!matchingIds.length}
            >
              Select all matching notes ({matchingIds.length})
            </button>
            <button className={buttonClass} type="button" onClick={() => onSelect([])} disabled={!ids.length}>
              Clear selection
            </button>
          </div>
          <p className="text-xs text-muted">
            Selection includes matching notes in collapsed groups. Changing search or topic clears selection.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-xs font-bold">
              Tag operation
              <select
                className={fieldClass}
                value={operation}
                onChange={(event) => setOperation(event.target.value as TagOperation)}
              >
                <option value="add">Add tags</option>
                <option value="remove">Remove tags</option>
                <option value="replace">Replace tags</option>
              </select>
            </label>
            <label className="grid min-w-40 flex-1 gap-1 text-xs font-bold">
              Bulk tags
              <input
                className={fieldClass}
                placeholder="Comma-separated tags"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
              />
            </label>
            <button
              className={buttonClass}
              type="button"
              disabled={busy || !ids.length || (operation !== 'replace' && !parseTags(tags).length)}
              onClick={() => void applyTags()}
            >
              {operation === 'replace'
                ? `${parseTags(tags).length ? 'Replace' : 'Clear'} tags on ${ids.length} note${ids.length === 1 ? '' : 's'}`
                : 'Apply tags'}
            </button>
          </div>
          {operation === 'replace' && (
            <p className="text-xs text-muted">
              This replaces all existing tags on the selected notes. Leaving the field empty clears their tags.
            </p>
          )}
          <div className="grid gap-2 border-t border-line pt-4">
            <p className="text-xs leading-relaxed text-muted">
              Regeneration sends each selected note’s title, URL, quote, and body to your configured LLM provider and
              replaces its tags and summary. Failed requests keep existing values.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                className={buttonClass}
                type="button"
                disabled={busy || running || !ids.length}
                onClick={() => void regenerate([...ids])}
              >
                Regenerate tags and summaries
              </button>
            </div>
          </div>
        </>
      )}
      {failedIds.length > 0 && (
        <button
          className={buttonClass}
          type="button"
          disabled={busy || running}
          onClick={() => void regenerate(failedIds)}
        >
          Retry failed notes
        </button>
      )}
      {batch && (
        <div role="status" aria-label="Bulk regeneration progress" aria-live="polite" className="text-xs text-muted">
          <strong className="block text-ink">{running ? 'Regenerating notes…' : 'Regeneration finished'}</strong>
          {batch.items.filter((i) => i.state === 'completed').length} completed · {failedIds.length} failed ·{' '}
          {batch.items.filter((i) => i.state === 'skipped').length} skipped
          {running && (
            <> · {batch.items.filter((i) => i.state === 'queued' || i.state === 'pending').length} remaining</>
          )}
          <p className="mt-1">
            Edited, deleted, or already generating notes are skipped. Interrupted requests can be retried.
          </p>
        </div>
      )}
      {result && (
        <p role="status" className="text-xs text-muted">
          {result}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
