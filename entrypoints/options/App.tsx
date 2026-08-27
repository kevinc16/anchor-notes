import { useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteNote,
  EMPTY_DATA,
  hostFromUrl,
  noteMatches,
  readData,
  saveNote,
  updateSettings,
  writeData,
} from '@/lib/storage';
import type { AnchorData, AnchorNote, AnchorSettings } from '@/lib/types';

type View = 'library' | 'settings';
type SortMode = 'newest' | 'oldest' | 'source';

const buttonClass = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-full border border-line bg-card px-4 text-xs font-bold text-ink transition hover:-translate-y-px hover:border-stone-400';
const fieldClass = 'w-full rounded-[10px] border border-line bg-white px-3 py-2.5 text-[13px] text-ink outline-none focus:border-stone-400 focus:ring-3 focus:ring-stone-200/60';

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2 text-[19px] font-extrabold tracking-[-0.03em]">
      <span className="grid size-8 -rotate-2 place-items-center rounded-[10px] bg-ink font-serif text-lg text-anchor">A</span>
      <span>Anchor</span>
    </div>
  );
}

function Tag({ children }: { children: string }) {
  return <span className="rounded-full bg-[#eee9df] px-2 py-1 text-[10px] font-bold text-[#605a51]">{children}</span>;
}

function EmptyState({ hasNotes }: { hasNotes: boolean }) {
  return (
    <div className="col-span-full px-6 py-24 text-center text-sm text-muted">
      <strong className="mb-2 block font-serif text-xl font-semibold text-ink">
        {hasNotes ? 'No matching notes' : 'Your library is waiting'}
      </strong>
      {hasNotes ? 'Try a different search or topic.' : 'Highlight a useful passage on any webpage to begin.'}
    </div>
  );
}

function NoteCard({ note, onEdit, onDelete }: { note: AnchorNote; onEdit: () => void; onDelete: () => void }) {
  return (
    <article className="flex min-h-60 flex-col overflow-hidden rounded-[17px] border border-line bg-card p-5 transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(51,43,31,.07)]">
      <header className="flex items-center justify-between text-[10px] font-bold text-muted">
        <span>{hostFromUrl(note.url)}</span>
        <time>{new Date(note.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time>
      </header>
      <blockquote className="my-5 font-serif text-lg font-medium leading-[1.42] text-[#312d27]">
        <span className="-ml-2 text-[#c38b00]">“</span>{note.quote}<span className="text-[#c38b00]">”</span>
      </blockquote>
      {note.body && <p className="mb-4 text-xs leading-relaxed text-muted">{note.body}</p>}
      {note.summary && <p className="mb-4 rounded-lg bg-[#f5f1e8] p-2.5 text-[11px] leading-relaxed text-muted">{note.summary}</p>}
      <div className="mt-auto flex flex-wrap gap-1.5">{note.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}</div>
      <footer className="mt-[18px] flex items-center justify-between border-t border-[#eee9df] pt-3">
        <a className="text-[11px] font-extrabold text-ink no-underline" href={note.url} target="_blank" rel="noreferrer">Return to source ↗</a>
        <div className="flex gap-2">
          <button className="text-[11px] font-bold text-muted" type="button" onClick={onEdit}>Edit</button>
          <button className="text-[11px] font-bold text-[#9c382f]" type="button" onClick={onDelete}>Delete</button>
        </div>
      </footer>
    </article>
  );
}

function Field({ label, children, help }: { label: string; children: React.ReactNode; help?: string }) {
  return (
    <label className="mb-4 grid gap-2">
      <span className="text-[11px] font-extrabold text-[#4c463e]">{label}</span>
      {children}
      {help && <span className="text-xs leading-relaxed text-muted">{help}</span>}
    </label>
  );
}

export default function App() {
  const [data, setData] = useState<AnchorData>(EMPTY_DATA);
  const [view, setView] = useState<View>('library');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [editing, setEditing] = useState<AnchorNote | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editTags, setEditTags] = useState('');
  const [settings, setSettings] = useState<AnchorSettings>(EMPTY_DATA.settings);
  const [toast, setToast] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void readData().then((next) => {
      setData(next);
      setSettings(next.settings);
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const topics = useMemo(() => {
    const counts = new Map<string, number>();
    data.notes.flatMap((note) => note.tags).forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([tag]) => tag);
  }, [data.notes]);

  const visibleNotes = useMemo(() => {
    const notes = data.notes.filter((note) => (filter === 'all' || note.tags.includes(filter)) && noteMatches(note, query));
    return [...notes].sort((a, b) => {
      if (sortMode === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortMode === 'source') return hostFromUrl(a.url).localeCompare(hostFromUrl(b.url));
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [data.notes, filter, query, sortMode]);

  function startEdit(note: AnchorNote) {
    setEditing(note);
    setEditBody(note.body);
    setEditTags(note.tags.join(', '));
  }

  async function persistEdit() {
    if (!editing) return;
    await saveNote({
      ...editing,
      body: editBody.trim(),
      tags: editTags.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean),
    });
    setData(await readData());
    setEditing(null);
    setToast('Changes saved');
  }

  async function removeNote(note: AnchorNote) {
    if (!window.confirm('Delete this saved highlight?')) return;
    await deleteNote(note.id);
    setData(await readData());
    setToast('Note deleted');
  }

  async function saveSettings() {
    await updateSettings(settings);
    setData(await readData());
    setToast('Settings saved');
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `anchor-notes-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function importData(file?: File) {
    if (!file) return;
    try {
      const incoming = JSON.parse(await file.text()) as Partial<AnchorData>;
      if (!Array.isArray(incoming.notes)) throw new Error('This backup does not contain a notes array.');
      const byId = new Map([...data.notes, ...incoming.notes].map((note) => [note.id, note]));
      await writeData({ ...data, notes: [...byId.values()] });
      setData(await readData());
      setToast('Backup imported');
    } catch (error) {
      window.alert(`Could not import backup: ${error instanceof Error ? error.message : 'Invalid file.'}`);
    }
    if (importRef.current) importRef.current.value = '';
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <aside className="fixed inset-y-0 left-0 flex w-[220px] flex-col border-r border-line bg-[#f4efe5] px-[18px] pb-5 pt-6 max-[760px]:static max-[760px]:h-auto max-[760px]:w-full max-[760px]:flex-row max-[760px]:items-center">
        <Brand />
        <nav className="mt-10 grid gap-1 max-[760px]:ml-auto max-[760px]:mt-0 max-[760px]:flex">
          {([['library', '⌂', 'Library'], ['settings', '⚙', 'Settings']] as const).map(([id, icon, label]) => (
            <button
              key={id}
              className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[13px] font-bold ${view === id ? 'bg-[#fffaf0] text-ink shadow-sm' : 'text-muted'}`}
              type="button"
              onClick={() => setView(id)}
            >
              <span>{icon}</span>{label}
            </button>
          ))}
        </nav>
        <div className="mt-auto grid gap-3.5 border-t border-[#ded6c8] px-2 pt-[18px] max-[760px]:hidden">
          <div className="flex items-baseline gap-1.5"><strong className="font-serif text-2xl font-semibold">{data.notes.length}</strong><span className="text-[11px] text-muted">saved ideas</span></div>
          <button className={buttonClass} type="button" onClick={exportData}>Export backup</button>
        </div>
      </aside>

      <main className="ml-[220px] px-[clamp(32px,6vw,88px)] pb-[70px] pt-12 max-[760px]:ml-0 max-[760px]:px-5 max-[760px]:py-8">
        {view === 'library' ? (
          <section>
            <header className="flex items-end justify-between gap-8 max-[760px]:flex-col max-[760px]:items-stretch">
              <div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">Your second memory</p><h1 className="mt-2 font-serif text-[clamp(32px,4vw,48px)] font-semibold leading-none tracking-[-0.035em]">Saved from the web</h1></div>
              <label className="flex h-11 w-[min(360px,35vw)] items-center gap-2 rounded-full border border-line bg-card px-3.5 max-[760px]:w-full">
                <span className="text-xl text-muted">⌕</span>
                <input className="w-full border-0 bg-transparent text-[13px] outline-none" type="search" placeholder="Search notes, tags, or sources…" value={query} onChange={(event) => setQuery(event.target.value)} />
              </label>
            </header>

            <div className="my-8 flex items-center justify-between gap-5 border-b border-line pb-3.5">
              <div className="flex gap-2 overflow-x-auto">
                {['all', ...topics].map((topic) => (
                  <button key={topic} className={`whitespace-nowrap rounded-full px-3 py-2 text-[11px] font-bold ${filter === topic ? 'bg-ink text-white' : 'text-muted'}`} type="button" onClick={() => setFilter(topic)}>{topic === 'all' ? 'All notes' : topic}</button>
                ))}
              </div>
              <select className="border-0 bg-transparent text-[11px] font-bold text-muted outline-none" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="source">By source</option>
              </select>
            </div>

            <div className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-4">
              {visibleNotes.length ? visibleNotes.map((note) => (
                <NoteCard key={note.id} note={note} onEdit={() => startEdit(note)} onDelete={() => void removeNote(note)} />
              )) : <EmptyState hasNotes={data.notes.length > 0} />}
            </div>
          </section>
        ) : (
          <section>
            <header className="max-w-[680px]"><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">Preferences</p><h1 className="mt-2 font-serif text-5xl font-semibold tracking-[-0.035em]">Settings</h1><p className="mt-3 text-[13px] leading-relaxed text-muted">Your highlights stay in Chrome's local storage unless you export them or enable a remote AI provider.</p></header>
            <div className="mt-7 max-w-[680px] rounded-[17px] border border-line bg-card p-6">
              <h2 className="mb-5 font-serif text-xl font-semibold">Organization</h2>
              <Field label="Organizer">
                <select className={fieldClass} value={settings.aiMode} onChange={(event) => setSettings({ ...settings, aiMode: event.target.value as AnchorSettings['aiMode'] })}>
                  <option value="local">Private, on-device topic rules</option><option value="remote">Remote LLM (OpenAI-compatible)</option>
                </select>
              </Field>
              {settings.aiMode === 'remote' && <>
                <Field label="API endpoint"><input className={fieldClass} type="url" value={settings.aiEndpoint} onChange={(event) => setSettings({ ...settings, aiEndpoint: event.target.value })} /></Field>
                <Field label="Model"><input className={fieldClass} type="text" value={settings.aiModel} onChange={(event) => setSettings({ ...settings, aiModel: event.target.value })} /></Field>
                <Field label="API key" help="New notes will be sent to this provider for tags and a short summary. Existing notes remain unchanged."><input className={fieldClass} type="password" autoComplete="off" placeholder="Stored locally in this browser" value={settings.aiApiKey} onChange={(event) => setSettings({ ...settings, aiApiKey: event.target.value })} /></Field>
              </>}
              <button className={`${buttonClass} border-ink bg-ink text-white`} type="button" onClick={() => void saveSettings()}>Save settings</button>
            </div>
            <div className="mt-7 max-w-[680px] rounded-[17px] border border-line bg-card p-6">
              <h2 className="mb-3 font-serif text-xl font-semibold">Data</h2>
              <p className="mb-5 text-[13px] leading-relaxed text-muted">Use JSON backups to move your library or keep an independent copy.</p>
              <div className="flex gap-2"><button className={buttonClass} type="button" onClick={exportData}>Export JSON</button><button className={buttonClass} type="button" onClick={() => importRef.current?.click()}>Import JSON</button><input ref={importRef} type="file" accept="application/json" hidden onChange={(event) => void importData(event.target.files?.[0])} /></div>
            </div>
          </section>
        )}
      </main>

      {editing && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-ink/35 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}>
          <section className="w-full max-w-[520px] rounded-[18px] border border-line bg-paper p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="edit-title">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">Edit note</p>
            <blockquote id="edit-title" className="my-5 font-serif text-lg font-medium leading-relaxed">“{editing.quote}”</blockquote>
            <Field label="Your note"><textarea className={fieldClass} rows={5} value={editBody} onChange={(event) => setEditBody(event.target.value)} /></Field>
            <Field label="Tags (comma separated)"><input className={fieldClass} type="text" value={editTags} onChange={(event) => setEditTags(event.target.value)} /></Field>
            <footer className="flex justify-end gap-2"><button className={buttonClass} type="button" onClick={() => setEditing(null)}>Cancel</button><button className={`${buttonClass} border-ink bg-ink text-white`} type="button" onClick={() => void persistEdit()}>Save changes</button></footer>
          </section>
        </div>
      )}

      {toast && <div className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-full bg-ink px-4 py-2.5 text-xs font-bold text-white shadow-xl">{toast}</div>}
    </div>
  );
}

