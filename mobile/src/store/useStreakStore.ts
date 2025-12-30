import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { useCoinStore } from './useCoinStore';

type StreakState = {
  streak: number;
  lastCheckIn: string | null;
  hydrate: () => Promise<void>;
  checkInToday: () => void;
  setStreak: (streak: number) => void;
};

export const useStreakStore = create<StreakState>((set, get) => ({
  streak: 0,
  lastCheckIn: null,

  hydrate: async () => {
    // const s = await AsyncStorage.getItem(STORAGE_KEYS.STREAK);
    // const d = await AsyncStorage.getItem(STORAGE_KEYS.LAST_CHECKIN);

    // set({
    //   streak: s ? Number(s) : 0,
    //   lastCheckIn: d,
    // });
  },
  setStreak: (streak: number) => set({ streak }),

  checkInToday: () => {
    const today = new Date().toDateString();
    const last = get().lastCheckIn;

    if (last === today) return;

    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const nextStreak = last === yesterday ? get().streak + 1 : 1;

    const base = 10 + nextStreak * 10;
    let bonus = 0;

    if (nextStreak === 10) bonus = 200;
    if (nextStreak === 20) bonus = 500;
    if (nextStreak === 30) bonus = 1000;
    if (nextStreak === 40) bonus = 2000;
    if (nextStreak === 50) bonus = 5000;

    useCoinStore.getState().addCoins(base + bonus);

    AsyncStorage.multiSet([
      [STORAGE_KEYS.STREAK, String(nextStreak)],
      [STORAGE_KEYS.LAST_CHECKIN, today],
    ]);

    set({ streak: nextStreak, lastCheckIn: today });
  },
}));
