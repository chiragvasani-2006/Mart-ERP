import { create } from 'zustand';
import { User } from 'firebase/auth';
import {
  loginWithEmailPassword,
  loginWithGoogle,
  logoutUser,
  subscribeToAuth,
  ADMIN_DEFAULT_EMAIL,
  ADMIN_DEFAULT_PASS
} from '../lib/authService';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean;
  loginError: string | null;
  adminEmail: string;
  login: (email: string, pass: string) => Promise<void>;
  loginGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  initAuth: () => () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isInitialized: false,
  loginError: null,
  adminEmail: ADMIN_DEFAULT_EMAIL,

  setLoading: (loading: boolean) => set({ isLoading: loading }),

  login: async (email: string, pass: string) => {
    set({ isLoading: true, loginError: null });
    try {
      const user = await loginWithEmailPassword(email, pass);
      set({ user, isLoading: false, loginError: null });
    } catch (err: any) {
      set({ isLoading: false, loginError: err.message || 'Login failed' });
      throw err;
    }
  },

  loginGoogle: async () => {
    set({ isLoading: true, loginError: null });
    try {
      const user = await loginWithGoogle();
      set({ user, isLoading: false, loginError: null });
    } catch (err: any) {
      set({ isLoading: false, loginError: err.message || 'Google Login failed' });
      throw err;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await logoutUser();
      set({ user: null, isLoading: false, loginError: null });
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },

  initAuth: () => {
    set({ isLoading: true });
    const unsubscribe = subscribeToAuth((user) => {
      set({ user, isLoading: false, isInitialized: true });
    });
    return unsubscribe;
  },
}));
