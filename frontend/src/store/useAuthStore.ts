import { create } from 'zustand';
import type { User } from '@/types';
import { useRideStore } from '@/store/useRideStore';
import {
  clearAuthToken,
  login as loginApi,
  me as meApi,
  setAuthToken,
  signup as signupApi,
} from '@/services/api';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  initialized: boolean;
  initializeAuth: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  initialized: false,

  initializeAuth: async () => {
    try {
      const user = await meApi();
      set({ user, isAuthenticated: true, initialized: true });
    } catch {
      clearAuthToken();
      useRideStore.getState().leaveRide();
      set({ user: null, isAuthenticated: false, initialized: true });
    }
  },

  login: async (email: string, password: string) => {
    const response = await loginApi({ email, password });
    useRideStore.getState().leaveRide();
    setAuthToken(response.token);
    set({ user: response.user, isAuthenticated: true, initialized: true });
  },

  signup: async (name: string, email: string, password: string) => {
    const response = await signupApi({ name, email, password });
    useRideStore.getState().leaveRide();
    setAuthToken(response.token);
    set({ user: response.user, isAuthenticated: true, initialized: true });
  },

  logout: () => {
    clearAuthToken();
    useRideStore.getState().leaveRide();
    set({ user: null, isAuthenticated: false, initialized: true });
  },
}));
