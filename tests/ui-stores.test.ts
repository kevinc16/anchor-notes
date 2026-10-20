import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../lib/settings';
import type { AnchorData } from '../lib/types';
import { useDataStore, useLibraryStore } from '../lib/ui-stores';

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
