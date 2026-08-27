import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { STORAGE_KEYS } from '../constants/storageKeys';

type StreakState = {
  streak: number;
  lastCheckIn: string | null;
  hydrate: () => Promise<void>;
  setStreak: (streak: number) => void;
  setFromBackend: (streak: number, lastCheckIn: string | null) => void;
};

export const useStreakStore = create<StreakState>((set) => ({
  streak: 0,
  lastCheckIn: null,

  hydrate: async () => {
    const s = await AsyncStorage.getItem(STORAGE_KEYS.STREAK);
    const d = await AsyncStorage.getItem(STORAGE_KEYS.LAST_CHECKIN);

    set({
      streak: s ? Number(s) : 0,
      lastCheckIn: d,
    });
  },

  setStreak: (streak: number) => set({ streak }),

  setFromBackend: (streak: number, lastCheckIn: string | null) => {
    AsyncStorage.multiSet([
      [STORAGE_KEYS.STREAK, String(streak)],
      [STORAGE_KEYS.LAST_CHECKIN, lastCheckIn ?? ''],
    ]);

    set({ streak, lastCheckIn });
  },
}));
