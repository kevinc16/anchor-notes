import { useEffect, useMemo, useRef, useState } from 'react';
import { applyLibraryNoteEdits } from '@/lib/note-edits';
import {
  deleteNote,
  EMPTY_DATA,
  noteMatches,
  readData,
  saveNote,
  updateSettings,
  writeData,
} from '@/lib/storage';
import type { AiProvider, AnchorData, AnchorNote, AnchorSettings, HighlightColor, HighlightCoverage } from '@/lib/types';
import { groupNotesByWebsite, hostFromUrl, toggleCollapsedWebsite } from '@/lib/websites';

type View = 'library' | 'settings';
type SortMode = 'newest' | 'oldest' | 'source';
type GroupMode = 'website' | 'none';

const buttonClass = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-full border border-line bg-card px-4 text-xs font-bold text-ink transition hover:-translate-y-px hover:border-stone-400';
const fieldClass = 'w-full rounded-[10px] border border-line bg-white px-3 py-2.5 text-[13px] text-ink outline-none focus:border-stone-400 focus:ring-3 focus:ring-stone-200/60';
const highlightColors: Array<{ id: HighlightColor; label: string; className: string }> = [
  { id: 'yellow', label: 'Yellow', className: 'bg-[#ffd74a]' },
  { id: 'mint', label: 'Mint', className: 'bg-[#72e1be]' },
  { id: 'lilac', label: 'Lilac', className: 'bg-[#bb97ff]' },
  { id: 'coral', label: 'Coral', className: 'bg-[#ff8b77]' },
];
const highlightCoverages: Array<{ id: HighlightCoverage; label: string; detail: string }> = [
  { id: 'small', label: 'Small', detail: '28%' },
  { id: 'medium', label: 'Medium', detail: '55%' },
  { id: 'full', label: 'Entire', detail: '100% element' },
];

const providerDefaults: Record<Exclude<AiProvider, 'local'>, Pick<AnchorSettings, 'aiEndpoint' | 'aiModel' | 'aiApiKey'>> = {
  openrouter: {
    aiEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
    aiModel: 'openrouter/free',
    aiApiKey: '',
  },
  ollama: {
    aiEndpoint: 'http://localhost:11434/v1/chat/completions',
    aiModel: 'llama3.2',
    aiApiKey: '',
  },
  custom: {
    aiEndpoint: 'https://api.openai.com/v1/chat/completions',
    aiModel: '',
    aiApiKey: '',
  },
};

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

function ColorPicker({ value, onChange }: { value: HighlightColor; onChange: (color: HighlightColor) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Highlight color">
      {highlightColors.map((color) => (
        <button
          key={color.id}
          className={`flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition ${value === color.id ? 'border-ink bg-stone-50 text-ink' : 'border-line text-muted'}`}
          type="button"
          aria-pressed={value === color.id}
          onClick={() => onChange(color.id)}
        >
          <span className={`size-4 rounded-full ${color.className}`} />{color.label}
        </button>
      ))}
    </div>
  );
}

function CoveragePicker({ value, onChange }: { value: HighlightCoverage; onChange: (coverage: HighlightCoverage) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Highlight coverage">
      {highlightCoverages.map((coverage) => (
        <button
          key={coverage.id}
          className={`rounded-[10px] border px-3 py-2 text-left transition ${value === coverage.id ? 'border-ink bg-stone-50 text-ink' : 'border-line text-muted'}`}
          type="button"
          aria-pressed={value === coverage.id}
          onClick={() => onChange(coverage.id)}
        >
          <strong className="block text-xs">{coverage.label}</strong>
          <span className="mt-0.5 block text-[10px]">{coverage.detail} coverage</span>
        </button>
      ))}
    </div>
  );
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
  const [groupMode, setGroupMode] = useState<GroupMode>('website');
  const [collapsedWebsites, setCollapsedWebsites] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<AnchorNote | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editColor, setEditColor] = useState<HighlightColor>('yellow');
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

  const websiteGroups = useMemo(() => groupNotesByWebsite(visibleNotes), [visibleNotes]);

  function toggleWebsite(website: string) {
    setCollapsedWebsites((current) => toggleCollapsedWebsite(current, website));
  }

  function startEdit(note: AnchorNote) {
    setEditing(note);
    setEditBody(note.body);
    setEditSummary(note.summary ?? '');
    setEditTags(note.tags.join(', '));
    setEditColor(note.color);
  }

  async function persistEdit() {
    if (!editing) return;
    await saveNote(applyLibraryNoteEdits(editing, {
      body: editBody,
      summary: editSummary,
      color: editColor,
      tags: editTags,
    }));
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

  async function toggleAi() {
    let nextSettings: AnchorSettings;
    if (settings.aiEnabled) {
      nextSettings = { ...settings, aiEnabled: false };
    } else if (settings.aiProvider === 'local') {
      nextSettings = {
        ...settings,
        aiEnabled: true,
        aiProvider: 'openrouter',
        ...providerDefaults.openrouter,
      };
    } else {
      nextSettings = { ...settings, aiEnabled: true };
    }
    await updateSettings(nextSettings);
    setSettings(nextSettings);
    setData(await readData());
    setToast(nextSettings.aiEnabled ? 'LLM organizer enabled' : 'LLM organizer disabled');
  }

  function selectProvider(provider: AiProvider) {
    if (provider === 'local') {
      setSettings({ ...settings, aiProvider: provider });
      return;
    }
    setSettings({ ...settings, aiProvider: provider, ...providerDefaults[provider] });
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
              <div className="flex shrink-0 items-center gap-3">
                <button
                  className={`rounded-full px-3 py-2 text-[11px] font-bold transition ${groupMode === 'website' ? 'bg-[#eee9df] text-ink' : 'text-muted'}`}
                  type="button"
                  aria-pressed={groupMode === 'website'}
                  onClick={() => setGroupMode(groupMode === 'website' ? 'none' : 'website')}
                >
                  Group by website
                </button>
                <select className="border-0 bg-transparent text-[11px] font-bold text-muted outline-none" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                  <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="source">By source</option>
                </select>
              </div>
            </div>

            {visibleNotes.length ? groupMode === 'website' ? (
              <div className="grid gap-10">
                {websiteGroups.map((group, index) => {
                  const isExpanded = !collapsedWebsites.has(group.website);
                  const panelId = `website-notes-${index}`;
                  return (
                    <section key={group.website} aria-label={`${group.website} notes`}>
                      <header className="mb-4 border-b border-line pb-2.5">
                        <h2>
                          <button
                            className="flex w-full items-center gap-2 text-left"
                            type="button"
                            aria-expanded={isExpanded}
                            aria-controls={panelId}
                            onClick={() => toggleWebsite(group.website)}
                          >
                            <span className="font-serif text-xl font-semibold">{group.website}</span>
                            <span className="text-[11px] font-bold text-muted">{group.notes.length} note{group.notes.length === 1 ? '' : 's'}</span>
                            <span className={`ml-auto text-lg text-muted transition-transform ${isExpanded ? '' : '-rotate-90'}`} aria-hidden="true">⌄</span>
                          </button>
                        </h2>
                      </header>
                      <div
                        id={panelId}
                        className={`${isExpanded ? 'grid' : 'hidden'} grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-4`}
                      >
                        {group.notes.map((note) => (
                          <NoteCard key={note.id} note={note} onEdit={() => startEdit(note)} onDelete={() => void removeNote(note)} />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-4">
                {visibleNotes.map((note) => (
                  <NoteCard key={note.id} note={note} onEdit={() => startEdit(note)} onDelete={() => void removeNote(note)} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-4">
                <EmptyState hasNotes={data.notes.length > 0} />
              </div>
            )}
          </section>
        ) : (
          <section>
            <header className="max-w-[680px]"><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">Preferences</p><h1 className="mt-2 font-serif text-5xl font-semibold tracking-[-0.035em]">Settings</h1><p className="mt-3 text-[13px] leading-relaxed text-muted">Your highlights stay in Chrome's local storage unless you export them or enable an LLM provider.</p></header>
            <div className="mt-7 max-w-[680px] rounded-[17px] border border-line bg-card p-6">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-serif text-xl font-semibold">Organization</h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted">Local topic tags always remain enabled.</p>
                </div>
                <button
                  className={`${buttonClass} ${settings.aiEnabled ? 'border-[#8b3a32] text-[#8b3a32]' : 'border-ink bg-ink text-white'}`}
                  type="button"
                  aria-pressed={settings.aiEnabled}
                  onClick={() => void toggleAi()}
                >
                  {settings.aiEnabled ? 'Disable LLM' : 'Enable LLM'}
                </button>
              </div>
              <Field label="Default highlight color" help="Used for new highlights. Individual notes can be recolored from the page or library.">
                <ColorPicker value={settings.highlightColor} onChange={(highlightColor) => setSettings({ ...settings, highlightColor })} />
              </Field>
              <Field label="Highlight coverage" help="Used for all new and restored highlights.">
                <CoveragePicker value={settings.highlightCoverage} onChange={(highlightCoverage) => setSettings({ ...settings, highlightCoverage })} />
              </Field>
              {settings.aiEnabled && <Field label="LLM provider">
                <select className={fieldClass} value={settings.aiProvider} onChange={(event) => selectProvider(event.target.value as AiProvider)}>
                  <option value="openrouter">OpenRouter — hosted open and free models</option>
                  <option value="ollama">Ollama — local open-source models</option>
                  <option value="custom">Custom OpenAI-compatible endpoint</option>
                </select>
              </Field>}
              {settings.aiEnabled && settings.aiProvider !== 'local' && <>
                <Field label="API endpoint"><input className={fieldClass} type="url" value={settings.aiEndpoint} readOnly={settings.aiProvider !== 'custom'} onChange={(event) => setSettings({ ...settings, aiEndpoint: event.target.value })} /></Field>
                <Field label="Model" help={settings.aiProvider === 'openrouter' ? 'Use openrouter/free or any model slug from the OpenRouter catalog.' : settings.aiProvider === 'ollama' ? 'Enter a model you have already pulled with Ollama.' : undefined}><input className={fieldClass} type="text" placeholder={settings.aiProvider === 'ollama' ? 'llama3.2' : 'provider/model'} value={settings.aiModel} onChange={(event) => setSettings({ ...settings, aiModel: event.target.value })} /></Field>
                {settings.aiProvider !== 'ollama' && <Field label="API key" help="New notes are sent to this provider for tags and a short summary. The key remains in local extension storage."><input className={fieldClass} type="password" autoComplete="off" placeholder="Stored locally in this browser" value={settings.aiApiKey} onChange={(event) => setSettings({ ...settings, aiApiKey: event.target.value })} /></Field>}
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
          <section className="max-h-[calc(100vh-2rem)] w-full max-w-[520px] overflow-y-auto rounded-[18px] border border-line bg-paper p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="edit-title">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">Edit note</p>
            <blockquote id="edit-title" className="my-5 font-serif text-lg font-medium leading-relaxed">“{editing.quote}”</blockquote>
            <Field label="Your note"><textarea className={fieldClass} rows={5} value={editBody} onChange={(event) => setEditBody(event.target.value)} /></Field>
            <Field label="Summary" help="Generated by your organizer when available. You can edit, replace, or clear it."><textarea className={fieldClass} rows={3} maxLength={500} value={editSummary} onChange={(event) => setEditSummary(event.target.value)} /></Field>
            <Field label="Tags (comma separated)"><input className={fieldClass} type="text" value={editTags} onChange={(event) => setEditTags(event.target.value)} /></Field>
            <Field label="Highlight color"><ColorPicker value={editColor} onChange={setEditColor} /></Field>
            <footer className="flex justify-end gap-2"><button className={buttonClass} type="button" onClick={() => setEditing(null)}>Cancel</button><button className={`${buttonClass} border-ink bg-ink text-white`} type="button" onClick={() => void persistEdit()}>Save changes</button></footer>
          </section>
        </div>
      )}

      {toast && <div className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-full bg-ink px-4 py-2.5 text-xs font-bold text-white shadow-xl">{toast}</div>}
    </div>
  );
}
