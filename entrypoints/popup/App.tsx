import { browser } from '#imports';
import { useEffect, useMemo, useState } from 'react';
import { EMPTY_DATA, hostFromUrl, normalizeUrl, readData } from '@/lib/storage';
import type { AnchorNote, ExtensionMessage } from '@/lib/types';
import { useDataStore } from '@/lib/ui-stores';
import { Icon } from '@/components/Icon';

interface PageState {
  tabId?: number;
  title: string;
  url: string;
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 font-extrabold tracking-[-0.03em]">
      <span className="grid size-8 -rotate-2 place-items-center rounded-lg bg-logo-surface font-serif text-lg font-extrabold text-anchor">
        A
      </span>
      <span>Anchor</span>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState<PageState>({ title: 'Loading…', url: '' });
  const { data, loadData, loading, error } = useDataStore();
  const allNotes = data?.notes ?? EMPTY_DATA.notes;

  useEffect(() => {
    void Promise.all([browser.tabs.query({ active: true, currentWindow: true }), loadData(readData)])
      .then(([tabs]) => {
        const tab = tabs[0];
        setPage({ tabId: tab?.id, title: tab?.title || 'Current page', url: tab?.url || '' });
      })
      .catch(() => setPage({ title: 'Current page', url: '' }));
  }, [loadData]);

  const notes = useMemo(() => {
    const pageUrl = normalizeUrl(page.url);
    return allNotes.filter(
      (note) => normalizeUrl(note.url) === pageUrl || normalizeUrl(note.canonicalUrl ?? '') === pageUrl,
    );
  }, [allNotes, page.url]);

  async function showOnPage(note: AnchorNote) {
    if (!page.tabId) return;
    await browser.tabs.sendMessage(page.tabId, { type: 'SCROLL_TO_NOTE', id: note.id } satisfies ExtensionMessage);
    window.close();
  }

  return (
    <div className="max-h-[600px] min-h-[480px] w-[390px] max-w-full overflow-y-auto bg-paper text-ink">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-paper/95 px-4xl py-3xl backdrop-blur-xl">
        <Brand />
        <button
          className="grid size-[34px] place-items-center rounded-full border border-line text-muted transition hover:border-control-border hover:bg-hover hover:text-ink active:scale-95"
          type="button"
          title="Open library"
          aria-label="Open library"
          onClick={() => void browser.runtime.openOptionsPage()}
        >
          <Icon name="external" />
        </button>
      </header>

      <main className="px-4xl py-5" aria-busy={loading}>
        {error && (
          <p role="alert" className="mb-4 text-xs text-danger">
            {error}
          </p>
        )}
        <section>
          <p className="text-overline font-medium uppercase tracking-[0.14em] text-muted">On this page</p>
          <h1 className="mt-2 truncate font-serif text-popup-title font-semibold leading-[1.14] tracking-[-0.02em]">
            {page.title}
          </h1>
          <p className="mt-1 text-xs text-muted">{page.url ? hostFromUrl(page.url) : ''}</p>
        </section>

        <div className="my-5 flex items-center justify-between rounded-xl border border-callout-border bg-callout-background px-2xl py-3 text-xs font-semibold text-callout-text">
          <span>Highlight text, then right-click</span>
          <kbd className="rounded-sm border border-b-2 border-callout-key-border bg-callout-key-background px-2 py-1 font-mono text-overline font-bold">
            ⌥ ⇧ H
          </kbd>
        </div>

        <section>
          <div className="mb-3 flex justify-between text-overline font-medium uppercase tracking-[0.08em] text-muted">
            <span>
              {notes.length} highlight{notes.length === 1 ? '' : 's'}
            </span>
            <button
              className="rounded-full px-2 py-1 font-extrabold text-ink transition hover:bg-hover hover:text-ink"
              type="button"
              onClick={() => void browser.runtime.openOptionsPage()}
            >
              View all
            </button>
          </div>

          {notes.length === 0 ? (
            <div className="px-6 py-9 text-center text-xs leading-relaxed text-muted">
              <strong className="mb-2 block font-serif text-xl font-semibold text-ink">Nothing anchored yet</strong>
              Select a passage on this page and save what caught your attention.
            </div>
          ) : (
            <div className="grid gap-2.5">
              {notes.map((note) => (
                <article key={note.id} className="rounded-xl border border-line bg-card p-2xl">
                  <blockquote className="font-serif text-lg font-medium leading-relaxed text-quote [overflow-wrap:anywhere]">
                    <span className="text-quote-accent">“</span>
                    {note.quote}
                    <span className="text-quote-accent">”</span>
                  </blockquote>
                  {note.body && (
                    <div className="mt-2">
                      <p className="mb-1 text-meta font-medium text-muted">Personal note</p>
                      <p className="text-sm leading-relaxed text-ink [overflow-wrap:anywhere]">{note.body}</p>
                    </div>
                  )}
                  <footer className="mt-3 flex items-center justify-between">
                    <span className="text-meta text-muted">{new Date(note.createdAt).toLocaleDateString()}</span>
                    <button
                      className="rounded-full px-2 py-1 text-meta font-bold text-ink transition hover:bg-hover hover:text-ink"
                      type="button"
                      onClick={() => void showOnPage(note)}
                    >
                      Show on page
                    </button>
                  </footer>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
