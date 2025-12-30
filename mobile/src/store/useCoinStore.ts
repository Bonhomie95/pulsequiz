import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { STORAGE_KEYS } from '../constants/storageKeys';

type CoinState = {
  coins: number;
  hydrate: () => Promise<void>;
  addCoins: (amount: number) => void;
  spendCoins: (amount: number) => boolean;
  setCoins: (coins: number) => void;
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

  spendCoins: (amount) => {
    const current = get().coins;
    if (current < amount) return false;

    const next = current - amount;
    AsyncStorage.setItem(STORAGE_KEYS.COINS, String(next));
    set({ coins: next });
    return true;
  },
}));
