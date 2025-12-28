import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { getLevelFromPoints } from '../utils/level';
import { STORAGE_KEYS } from '../constants/storageKeys';

type ProgressState = {
  points: number;
  level: number;
  hydrate: () => Promise<void>;
  addPoints: (amount: number) => void;
};

export const useProgressStore = create<ProgressState>((set, get) => ({
  points: 0,
  level: 1,

  hydrate: async () => {
    const p = await AsyncStorage.getItem(STORAGE_KEYS.POINTS);
    const l = await AsyncStorage.getItem(STORAGE_KEYS.LEVEL);

    set({
      points: p ? Number(p) : 0,
      level: l ? Number(l) : 1,
    });
  },

  addPoints: (amount) => {
    const nextPoints = get().points + amount;
    const nextLevel = getLevelFromPoints(nextPoints);

    AsyncStorage.multiSet([
      [STORAGE_KEYS.POINTS, String(nextPoints)],
      [STORAGE_KEYS.LEVEL, String(nextLevel)],
    ]);

    set({ points: nextPoints, level: nextLevel });
  },
}));
