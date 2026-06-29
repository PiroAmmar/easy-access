'use client';

import { create } from 'zustand';
import type { FileEntry } from '@easy-access/shared';

type ViewMode = 'grid' | 'list';
type SortField = 'name' | 'size' | 'modifiedAt' | 'type';
type SortDir = 'asc' | 'desc';

interface FileStore {
  serverId: string | null;
  currentPath: string;
  entries: FileEntry[];
  isLoading: boolean;
  error: string | null;
  selectedEntries: Set<string>;
  viewMode: ViewMode;
  sortField: SortField;
  sortDir: SortDir;

  setServer: (serverId: string, rootPath: string) => void;
  navigateTo: (path: string) => Promise<void>;
  refresh: () => Promise<void>;
  goUp: () => Promise<void>;
  toggleSelect: (path: string) => void;
  clearSelection: () => void;
  selectAll: () => void;
  setViewMode: (mode: ViewMode) => void;
  setSort: (field: SortField) => void;
}

export const useFileStore = create<FileStore>((set, get) => ({
  serverId: null,
  currentPath: '',
  entries: [],
  isLoading: false,
  error: null,
  selectedEntries: new Set(),
  viewMode: 'grid',
  sortField: 'name',
  sortDir: 'asc',

  setServer: (serverId, rootPath) => {
    set({ serverId, currentPath: rootPath, entries: [], selectedEntries: new Set() });
    get().navigateTo(rootPath);
  },

  navigateTo: async (path) => {
    const { serverId } = get();
    if (!serverId) return;

    set({ isLoading: true, error: null, currentPath: path, selectedEntries: new Set() });
    try {
      const params = new URLSearchParams({ serverId, path, action: 'list' });
      const res = await fetch(`/api/files?${params}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Failed to list directory');
      set({ entries: json.data, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false, entries: [] });
    }
  },

  refresh: async () => {
    const { currentPath } = get();
    if (currentPath) await get().navigateTo(currentPath);
  },

  goUp: async () => {
    const { currentPath } = get();
    if (!currentPath) return;
    // Get parent directory
    const sep = currentPath.includes('\\') ? '\\' : '/';
    const parts = currentPath.split(sep).filter(Boolean);
    if (parts.length <= 1) return; // Already at root
    parts.pop();
    const parent = currentPath.startsWith('/') ? '/' + parts.join(sep) : parts.join(sep) + sep;
    await get().navigateTo(parent);
  },

  toggleSelect: (path) => {
    set((state) => {
      const next = new Set(state.selectedEntries);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return { selectedEntries: next };
    });
  },

  clearSelection: () => set({ selectedEntries: new Set() }),

  selectAll: () => {
    const { entries } = get();
    set({ selectedEntries: new Set(entries.map((e) => e.path)) });
  },

  setViewMode: (mode) => set({ viewMode: mode }),

  setSort: (field) => {
    const { sortField, sortDir } = get();
    if (sortField === field) {
      set({ sortDir: sortDir === 'asc' ? 'desc' : 'asc' });
    } else {
      set({ sortField: field, sortDir: 'asc' });
    }
  },
}));
