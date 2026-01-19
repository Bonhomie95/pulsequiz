import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

type AudioState = {
  muted: boolean;
  masterVolume: number; // 0..1
  effectsVolume: number; // 0..1

  setMuted: (v: boolean) => void;
  setMasterVolume: (v: number) => void;
  setEffectsVolume: (v: number) => void;
};

export const useAudioStore = create<AudioState>()(
  persist(
    (set) => ({
      muted: false,
      masterVolume: 1,
      effectsVolume: 1,

      setMuted: (muted) => set({ muted }),
      setMasterVolume: (masterVolume) => set({ masterVolume }),
      setEffectsVolume: (effectsVolume) => set({ effectsVolume }),
    }),
    {
      name: 'audio-settings', // 🔐 storage key
      storage: {
        getItem: async (name) => {
          const value = await AsyncStorage.getItem(name);
          return value ? JSON.parse(value) : null;
        },
        setItem: async (name, value) => {
          await AsyncStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: async (name) => {
          await AsyncStorage.removeItem(name);
        },
      },
    },
  ),
);
