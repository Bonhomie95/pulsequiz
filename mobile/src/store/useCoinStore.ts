import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { STORAGE_KEYS } from '../constants/storageKeys';

type CoinState = {
  coins: number;
  hydrate: () => Promise<void>;
  addCoins: (amount: number) => void;
  setCoins: (coins: number) => void;
  /**
   * Sync from a server response. Prefers the authoritative absolute total
   * (`coins`) so the balance can't drift; falls back to adding a delta only
   * when the endpoint doesn't return a total.
   */
  syncFromServer: (data: { coins?: number; coinsAdded?: number }) => void;
};

export const useCoinStore = create<CoinState>((set, get) => ({
  coins: 0,

  hydrate: async () => {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.COINS);
    if (stored) set({ coins: Number(stored) });
  },

  addCoins: (amount) => {
    const next = get().coins + amount;
    AsyncStorage.setItem(STORAGE_KEYS.COINS, String(next));
    set({ coins: next });
  },
  setCoins: (coins: number) => set({ coins }),

  syncFromServer: (data) => {
    if (typeof data?.coins === 'number') {
      AsyncStorage.setItem(STORAGE_KEYS.COINS, String(data.coins));
      set({ coins: data.coins });
    } else if (typeof data?.coinsAdded === 'number') {
      get().addCoins(data.coinsAdded);
    }
  },
}));
