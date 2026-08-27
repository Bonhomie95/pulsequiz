import { create } from 'zustand';
import { storage } from '../utils/storage';
import {
  api,
  setAuthToken,
  setUnauthorizedHandler,
  setTokenRefresher,
} from '../api/api';
import { logger } from '../utils/logger';

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
  provider?: string;
};

type AuthState = {
  user: User | null;
  hydrated: boolean;
  setUser: (u: User) => void;
  updateUser: (u: Partial<User>) => void;
  /** Store a freshly issued session (login or refresh). */
  setSession: (token: string, refreshToken?: string | null) => Promise<void>;
  logout: (opts?: { notifyServer?: boolean }) => Promise<void>;
  setHydrated: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  hydrated: false,

  setUser: (user) => set({ user }),

  updateUser: (partial) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...partial } : state.user,
    })),

  setSession: async (token, refreshToken) => {
    await storage.setSession(token, refreshToken);
    setAuthToken(token);
  },

  logout: async ({ notifyServer = true } = {}) => {
    // Tell the server first, while we still hold a valid token. This bumps the
    // account's token version, which is what actually revokes every
    // outstanding session rather than just clearing this device.
    if (notifyServer) {
      try {
        await api.post('/auth/logout');
      } catch {
        // Offline or already-invalid session — clearing locally is still right.
      }
    }

    try {
      const { unregisterPushToken } = await import('../utils/push');
      await unregisterPushToken();
    } catch {}

    await storage.clearToken();
    setAuthToken(null);
    set({ user: null });
  },

  setHydrated: () => set({ hydrated: true }),
}));

// Let the API layer force a logout when the server rejects the session
// (401 after a failed refresh, 403 banned). Guarded so a request that fails
// while already logged out doesn't loop.
setUnauthorizedHandler(() => {
  if (useAuthStore.getState().user) {
    // The token is already dead — don't try to call the server with it.
    useAuthStore.getState().logout({ notifyServer: false });
  }
});

// Access tokens are short-lived now. When one expires mid-session the API
// layer calls this once, stores the new pair, and replays the request — so the
// user never sees a spurious sign-out.
setTokenRefresher(async () => {
  const refreshToken = await storage.getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await api.post(
      '/auth/refresh',
      { refreshToken },
      // Bypass the default Authorization header; the refresh token is the
      // credential here, and the expired access token would just 401 again.
      { headers: { Authorization: '' } },
    );

    const { token, refreshToken: nextRefresh, user } = res.data ?? {};
    if (!token) return null;

    await storage.setSession(token, nextRefresh);
    setAuthToken(token);
    if (user) useAuthStore.getState().setUser(user);

    return token as string;
  } catch (err) {
    logger.debug('Token refresh failed', { err: String(err) });
    return null;
  }
});
