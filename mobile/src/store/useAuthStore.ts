import { create } from 'zustand';
import { storage } from '../utils/storage';
import { setAuthToken, setUnauthorizedHandler } from '../api/api';

export type UsdtType = 'TRC20' | 'ERC20' | 'BEP20';

export type User = {
  id: string;
  email: string;
  username?: string | null;
  avatar?: string | null;
  usdtType?: UsdtType;
  usdtAddress?: string;
  withdrawalEnabled?: boolean;
  publicProfile?: boolean;
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

// Let the API layer force a logout when the server rejects the session
// (401 expired/invalid token, 403 banned). Guarded so a request that fails
// while already logged out doesn't loop.
setUnauthorizedHandler(() => {
  if (useAuthStore.getState().user) {
    useAuthStore.getState().logout();
  }
});
