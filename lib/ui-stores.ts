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

export type LibraryLayout = 'cards' | 'list';

export function normalizeLibraryLayout(value: unknown): LibraryLayout {
  return value === 'list' ? 'list' : 'cards';
}

export type SortMode = 'newest' | 'oldest' | 'source';

interface LibraryStore {
  view: 'library' | 'settings';
  layout: LibraryLayout;
  setLayout: (layout: LibraryLayout) => void;
  query: string;
  filter: string;
  sortMode: SortMode;
  groupMode: 'website' | 'none';
  collapsedWebsites: Set<string>;
  selecting: boolean;
  selectedIds: Set<string>;
  setSelecting: (selecting: boolean) => void;
  toggleSelected: (id: string) => void;
  selectNotes: (ids: string[]) => void;
  retainSelected: (ids: string[]) => void;
  setView: (view: LibraryStore['view']) => void;
  setQuery: (query: string) => void;
  setFilter: (filter: string) => void;
  setSortMode: (sortMode: SortMode) => void;
  setGroupMode: (groupMode: LibraryStore['groupMode']) => void;
  toggleWebsite: (website: string) => void;
}

export const useLibraryStore = create<LibraryStore>()((set) => ({
  view: 'library',
  layout: 'cards',
  setLayout: (layout) => set({ layout }),
  query: '',
  filter: 'all',
  sortMode: 'newest',
  groupMode: 'website',
  collapsedWebsites: new Set(),
  selecting: false,
  selectedIds: new Set(),
  setSelecting: (selecting) => set({ selecting, selectedIds: new Set() }),
  toggleSelected: (id) =>
    set((state) => {
      const selectedIds = new Set(state.selectedIds);
      if (selectedIds.has(id)) selectedIds.delete(id);
      else selectedIds.add(id);
      return { selectedIds };
    }),
  selectNotes: (ids) => set({ selectedIds: new Set(ids) }),
  retainSelected: (ids) =>
    set((state) => {
      const existing = new Set(ids);
      const selectedIds = new Set([...state.selectedIds].filter((id) => existing.has(id)));
      return selectedIds.size === state.selectedIds.size ? state : { selectedIds };
    }),
  setView: (view) => set({ view }),
  setQuery: (query) => set({ query, selectedIds: new Set() }),
  setFilter: (filter) => set({ filter, selectedIds: new Set() }),
  setSortMode: (sortMode) => set({ sortMode }),
  setGroupMode: (groupMode) => set({ groupMode }),
  toggleWebsite: (website) =>
    set((state) => ({ collapsedWebsites: toggleCollapsedWebsite(state.collapsedWebsites, website) })),
}));
