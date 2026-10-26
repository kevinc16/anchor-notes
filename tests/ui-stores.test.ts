import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../lib/settings';
import type { AnchorData } from '../lib/types';
import { normalizeLibraryLayout, useDataStore, useLibraryStore } from '../lib/ui-stores';

const data: AnchorData = { schemaVersion: 1, notes: [], settings: { ...DEFAULT_SETTINGS } };

beforeEach(() => {
  useDataStore.setState(useDataStore.getInitialState(), true);
  useLibraryStore.setState(useLibraryStore.getInitialState(), true);
});

describe('data store', () => {
  it('keeps the last snapshot while refreshing and replaces it only after the read succeeds', async () => {
    await useDataStore.getState().loadData(async () => data);
    const next: AnchorData = { ...data, settings: { ...data.settings, highlightColor: 'coral' } };
    let finish!: (value: AnchorData) => void;
    const pending = useDataStore.getState().loadData(() => new Promise((resolve) => (finish = resolve)));

    expect(useDataStore.getState()).toMatchObject({ data, loading: true, error: '' });
    finish(next);
    expect(await pending).toBe(next);
    expect(useDataStore.getState()).toMatchObject({ data: next, loading: false, error: '' });
  });

  it('retains saved data on failure, hides sensitive errors, and allows a retry', async () => {
    await useDataStore.getState().loadData(async () => data);
    await expect(
      useDataStore.getState().loadData(async () => {
        throw new Error('private provider details');
      }),
    ).rejects.toThrow('private provider details');
    expect(useDataStore.getState()).toMatchObject({ data, loading: false, error: 'Could not load saved notes.' });

    await useDataStore.getState().loadData(async () => data);
    expect(useDataStore.getState()).toMatchObject({ data, loading: false, error: '' });
  });
});

describe('library store', () => {
  it('preserves browsing controls when switching views', () => {
    const actions = useLibraryStore.getState();
    actions.setQuery('research');
    actions.setFilter('engineering');
    actions.setSortMode('oldest');
    actions.setGroupMode('none');
    actions.setView('settings');
    actions.setView('library');

    expect(useLibraryStore.getState()).toMatchObject({
      view: 'library',
      query: 'research',
      filter: 'engineering',
      sortMode: 'oldest',
      groupMode: 'none',
    });
  });

  it('toggles website groups without mutating previous snapshots or other groups', () => {
    const { toggleWebsite } = useLibraryStore.getState();
    toggleWebsite('example.com');
    const previous = useLibraryStore.getState().collapsedWebsites;
    toggleWebsite('docs.example.com');
    toggleWebsite('example.com');

    expect(previous).toEqual(new Set(['example.com']));
    expect(useLibraryStore.getState().collapsedWebsites).toEqual(new Set(['docs.example.com']));
  });
});

describe('library selection', () => {
  it('clears selection for search/topic changes but preserves it across sorting and grouping', () => {
    const actions = useLibraryStore.getState();
    actions.setSelecting(true);
    actions.toggleSelected('one');
    actions.toggleSelected('two');
    actions.setSortMode('oldest');
    actions.setGroupMode('none');
    actions.toggleWebsite('example.com');
    expect(useLibraryStore.getState().selectedIds).toEqual(new Set(['one', 'two']));
    actions.setQuery('search');
    expect(useLibraryStore.getState().selectedIds.size).toBe(0);
    actions.toggleSelected('one');
    actions.setFilter('research');
    expect(useLibraryStore.getState().selectedIds.size).toBe(0);
    actions.selectNotes(['one', 'two', 'one']);
    actions.retainSelected(['two']);
    expect(useLibraryStore.getState().selectedIds).toEqual(new Set(['two']));
    actions.setSelecting(false);
    expect(useLibraryStore.getState().selectedIds.size).toBe(0);
  });
});

describe('library reading layout', () => {
  it('preserves browsing state and selected notes when switching layouts', () => {
    const actions = useLibraryStore.getState();
    actions.setQuery('research');
    actions.setFilter('engineering');
    actions.setSortMode('oldest');
    actions.setGroupMode('none');
    actions.toggleWebsite('example.com');
    actions.setSelecting(true);
    actions.selectNotes(['one', 'two']);
    actions.setLayout('list');
    expect(useLibraryStore.getState()).toMatchObject({
      layout: 'list',
      query: 'research',
      filter: 'engineering',
      sortMode: 'oldest',
      groupMode: 'none',
      collapsedWebsites: new Set(['example.com']),
      selecting: true,
      selectedIds: new Set(['one', 'two']),
    });
    actions.setLayout('cards');
    expect(useLibraryStore.getState().selectedIds).toEqual(new Set(['one', 'two']));
  });

  it.each([undefined, null, '', 'grid', {}, 1])('defaults invalid saved layout %j to Cards', (value) => {
    expect(normalizeLibraryLayout(value)).toBe('cards');
  });

  it.each(['cards', 'list'] as const)('restores the saved %s layout', (value) => {
    expect(normalizeLibraryLayout(value)).toBe(value);
  });
});
