'use client';

import { create } from 'zustand';
import type { Server } from '@easy-access/shared';

interface ServerStore {
  servers: Server[];
  isLoading: boolean;
  error: string | null;
  selectedServerId: string | null;

  fetchServers: () => Promise<void>;
  addServer: (data: { name: string; description?: string; allowedDirs: string[] }) => Promise<Server>;
  removeServer: (id: string) => Promise<void>;
  updateServer: (id: string, data: { name?: string; description?: string; allowedDirs?: string[] }) => Promise<void>;
  setSelectedServer: (id: string | null) => void;
}

export const useServerStore = create<ServerStore>((set, get) => ({
  servers: [],
  isLoading: false,
  error: null,
  selectedServerId: null,

  fetchServers: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/servers');
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Failed to fetch');
      set({ servers: json.data, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  addServer: async (data) => {
    set({ error: null });
    const res = await fetch('/api/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error ?? 'Failed to create');
    set((state) => ({ servers: [json.data, ...state.servers] }));
    return json.data;
  },

  removeServer: async (id) => {
    set({ error: null });
    const res = await fetch(`/api/servers/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.success) throw new Error(json.error ?? 'Failed to delete');
    set((state) => ({
      servers: state.servers.filter((s) => s.id !== id),
      selectedServerId: state.selectedServerId === id ? null : state.selectedServerId,
    }));
  },

  updateServer: async (id, data) => {
    set({ error: null });
    const res = await fetch(`/api/servers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error ?? 'Failed to update');
    set((state) => ({
      servers: state.servers.map((s) => (s.id === id ? json.data : s)),
    }));
  },

  setSelectedServer: (id) => set({ selectedServerId: id }),
}));
