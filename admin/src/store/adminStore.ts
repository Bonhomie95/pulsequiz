import { create } from 'zustand';

type AdminUser = {
  email: string;
  role: 'SUPER_ADMIN' | 'MODERATOR';
};

// The auth credential lives in an httpOnly cookie (unreadable by JS). We keep
// only the non-sensitive admin profile in localStorage so the UI knows who is
// signed in and can survive a page reload. If the cookie is gone/expired, the
// first API call 401s and the client interceptor clears this.
const STORED_ADMIN = 'admin_user';

function loadStoredAdmin(): AdminUser | null {
  try {
    const raw = localStorage.getItem(STORED_ADMIN);
    return raw ? (JSON.parse(raw) as AdminUser) : null;
  } catch {
    return null;
  }
}

type AdminState = {
  admin: AdminUser | null;
  setAdmin: (admin: AdminUser) => void;
  clearSession: () => void; // local-only (used by the 401 interceptor)
  logout: () => Promise<void>; // clears the server cookie + local state
  /** Re-read the identity from the server. localStorage is a cache the user
   *  can edit; the role that actually matters is the one on the token, so the
   *  UI refreshes it on load rather than trusting the stored copy. */
  refresh: () => Promise<void>;
};

export const useAdminStore = create<AdminState>((set) => ({
  admin: loadStoredAdmin(),

  setAdmin: (admin) => {
    localStorage.setItem(STORED_ADMIN, JSON.stringify(admin));
    set({ admin });
  },

  clearSession: () => {
    localStorage.removeItem(STORED_ADMIN);
    set({ admin: null });
  },

  refresh: async () => {
    try {
      const { adminApi } = await import('../api/client');
      const res = await adminApi.get('/admin/me');
      const admin = res.data?.admin;
      if (admin?.email && admin?.role) {
        localStorage.setItem(STORED_ADMIN, JSON.stringify(admin));
        set({ admin });
      }
    } catch {
      // The 401 interceptor handles an expired session.
    }
  },

  logout: async () => {
    try {
      // Dynamic import avoids a static import cycle with the api client.
      const { adminApi } = await import('../api/client');
      await adminApi.post('/admin/logout');
    } catch {
      // ignore — clear locally regardless
    }
    localStorage.removeItem(STORED_ADMIN);
    set({ admin: null });
  },
}));
