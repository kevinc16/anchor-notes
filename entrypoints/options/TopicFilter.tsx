import { useRef, useState } from 'react';

export function TopicFilter({
  tags,
  value,
  onChange,
}: {
  tags: string[];
  value: string | null;
  onChange: (tag: string | null) => void;
}) {
  const [search, setSearch] = useState('');
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const matches = tags.filter((tag) => tag.toLowerCase().includes(search.trim().toLowerCase()));

  function close() {
    if (!detailsRef.current) return;
    detailsRef.current.open = false;
    setSearch('');
    detailsRef.current.querySelector('summary')?.focus();
  }

  function select(tag: string | null) {
    onChange(tag);
    close();
  }

  return (
    <details
      ref={detailsRef}
      className="relative w-40 max-w-full shrink-0"
      onToggle={(event) => {
        if (event.currentTarget.open) searchRef.current?.focus();
        else setSearch('');
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close();
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          event.currentTarget.open = false;
          setSearch('');
        }
      }}
    >
      <summary
        className="cursor-pointer rounded-full border border-line bg-card px-3 py-2 text-xs font-bold text-ink marker:text-muted hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        title={`Topic: ${value ?? 'All notes'}`}
      >
        <span className="inline-block max-w-[calc(100%-1rem)] truncate align-middle">
          Topic: {value ?? 'All notes'}
        </span>
      </summary>
      <div className="absolute left-0 z-10 mt-2 w-72 max-w-[calc(100vw-40px)] rounded-xl border border-line bg-card p-3 shadow-note">
        <label className="grid gap-1 text-xs font-bold text-ink">
          Find a tag
          <input
            ref={searchRef}
            className="min-w-0 rounded-lg border border-line bg-white px-3 py-2 text-body outline-none focus:ring-2 focus:ring-ink/20"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="mt-2 max-h-64 overflow-y-auto" role="group" aria-label="Available tags">
          <button
            className="w-full rounded-lg px-2 py-2 text-left text-xs font-bold hover:bg-stone-100"
            type="button"
            aria-pressed={value === null}
            onClick={() => select(null)}
          >
            All notes
          </button>
          {matches.map((tag) => (
            <button
              key={tag}
              className={`w-full rounded-lg px-2 py-2 text-left text-xs break-words [overflow-wrap:anywhere] hover:bg-stone-100 ${value === tag ? 'bg-tag-background font-bold' : ''}`}
              type="button"
              aria-label={`Filter by tag: ${tag}`}
              aria-pressed={value === tag}
              onClick={() => select(tag)}
            >
              {tag}
            </button>
          ))}
          {!matches.length && (
            <p className="px-2 py-3 text-xs text-muted">{tags.length ? 'No matching tags.' : 'No tags yet.'}</p>
          )}
        </div>
      </div>
    </details>
  );
}
