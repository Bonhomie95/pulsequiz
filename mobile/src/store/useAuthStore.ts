import { create } from 'zustand';
import { storage } from '../utils/storage';
import { setAuthToken } from '../api/api';

export type UsdtType = 'TRC20' | 'ERC20' | 'BEP20';

export type User = {
  id: string;
  email: string;
  username?: string | null;
  avatar?: string | null;
  usdtType?: UsdtType;
  usdtAddress?: string;
  withdrawalEnabled?: boolean;
};

type AuthState = {
  user: User | null;
  hydrated: boolean;
  setUser: (u: User) => void;
  updateUser: (u: Partial<User>) => void;
  logout: () => void;
  setHydrated: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  hydrated: false,

  setUser: (user) =>
    set({
      user,
    }),

  // ✅ THIS IS IMPORTANT
  updateUser: (partial) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...partial } : state.user,
    })),

  logout: async () => {
    await storage.clearToken();
    setAuthToken(null);
    set({
      user: null,
    });
  },

  setHydrated: () =>
    set({
      hydrated: true,
    }),
}));
