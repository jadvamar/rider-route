import { create } from 'zustand';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,

  login: async (email: string, _password: string) => {
    // Mock login — replace with real API
    await new Promise((r) => setTimeout(r, 500));
    const user: User = {
      id: crypto.randomUUID(),
      name: email.split('@')[0],
      email,
    };
    set({ user, isAuthenticated: true });
  },

  signup: async (name: string, email: string, _password: string) => {
    await new Promise((r) => setTimeout(r, 500));
    const user: User = {
      id: crypto.randomUUID(),
      name,
      email,
    };
    set({ user, isAuthenticated: true });
  },

  logout: () => {
    set({ user: null, isAuthenticated: false });
  },
}));
