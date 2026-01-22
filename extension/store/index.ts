import { create } from 'zustand';
import type { User, UserCredits } from '@shared/types';

interface AppState {
  user: User | null;
  credits: UserCredits | null;
  isLoading: boolean;
  error: string | null;

  setUser: (user: User | null) => void;
  setCredits: (credits: UserCredits | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  checkAuth: () => Promise<void>;
  fetchCredits: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  user: null,
  credits: null,
  isLoading: true,
  error: null,

  setUser: (user) => set({ user }),
  setCredits: (credits) => set({ credits }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  checkAuth: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await chrome.runtime.sendMessage({ type: 'AUTH_STATUS' });
      if (response?.payload?.user) {
        set({ user: response.payload.user });
      }
    } catch (err) {
      console.error('Auth check failed:', err);
    } finally {
      set({ isLoading: false });
    }
  },

  fetchCredits: async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_CREDITS' });
      if (response?.payload) {
        set({ credits: response.payload });
      }
    } catch (err) {
      console.error('Failed to fetch credits:', err);
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'LOGIN',
        payload: { email, password },
      });

      if (response?.error) {
        throw new Error(response.error);
      }

      if (response?.payload?.user) {
        set({ user: response.payload.user });
        await get().fetchCredits();
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Login failed' });
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'LOGOUT' });
      set({ user: null, credits: null });
    } catch (err) {
      console.error('Logout failed:', err);
    }
  },
}));
