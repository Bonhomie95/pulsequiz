import { create } from 'zustand';
import { api } from '../api/api';

type PremiumState = {
  isPremium: boolean;
  expiresAt: string | null;
  plan: string | null;
  checked: boolean;

  setPremium: (data: {
    isPremium: boolean;
    expiresAt?: string | null;
    plan?: string | null;
  }) => void;
  checkStatus: () => Promise<void>;
  clear: () => void;
};

export const usePremiumStore = create<PremiumState>((set) => ({
  isPremium: false,
  expiresAt: null,
  plan: null,
  checked: false,

  setPremium: ({ isPremium, expiresAt = null, plan = null }) =>
    set({ isPremium, expiresAt, plan, checked: true }),

  checkStatus: async () => {
    try {
      const res = await api.get('/subscription/status');
      set({
        isPremium: res.data.isPremium ?? false,
        expiresAt: res.data.expiresAt ?? null,
        plan: res.data.plan ?? null,
        checked: true,
      });
    } catch {
      // Network error — keep current state, still mark checked
      set((s) => ({ ...s, checked: true }));
    }
  },

  clear: () =>
    set({ isPremium: false, expiresAt: null, plan: null, checked: false }),
}));
