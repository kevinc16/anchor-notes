import { create } from 'zustand';
import type { AnchorData } from './types';
import { toggleCollapsedWebsite } from './websites';

interface DataStore {
  data: AnchorData | null;
  loading: boolean;
  error: string;
  loadData: (read: () => Promise<AnchorData>) => Promise<AnchorData>;
}

// Only cache normalized storage snapshots. Browser I/O stays in the entrypoints.
export const useDataStore = create<DataStore>()((set) => ({
  data: null,
  loading: false,
  error: '',
  loadData: async (read) => {
    set({ loading: true, error: '' });
    try {
      const data = await read();
      set({ data, loading: false });
      return data;
    } catch (error) {
      set({ loading: false, error: 'Could not load saved notes.' });
      throw error;
    }
  },
}));

export type SortMode = 'newest' | 'oldest' | 'source';

interface LibraryStore {
  view: 'library' | 'settings';
  query: string;
  filter: string;
  sortMode: SortMode;
  groupMode: 'website' | 'none';
  collapsedWebsites: Set<string>;
  setView: (view: LibraryStore['view']) => void;
  setQuery: (query: string) => void;
  setFilter: (filter: string) => void;
  setSortMode: (sortMode: SortMode) => void;
  setGroupMode: (groupMode: LibraryStore['groupMode']) => void;
  toggleWebsite: (website: string) => void;
}

export const useLibraryStore = create<LibraryStore>()((set) => ({
  view: 'library',
  query: '',
  filter: 'all',
  sortMode: 'newest',
  groupMode: 'website',
  collapsedWebsites: new Set(),
  setView: (view) => set({ view }),
  setQuery: (query) => set({ query }),
  setFilter: (filter) => set({ filter }),
  setSortMode: (sortMode) => set({ sortMode }),
  setGroupMode: (groupMode) => set({ groupMode }),
  toggleWebsite: (website) =>
    set((state) => ({ collapsedWebsites: toggleCollapsedWebsite(state.collapsedWebsites, website) })),
}));
