import { create } from 'zustand';

type AudioState = {
  muted: boolean;
  masterVolume: number; // 0..1
  effectsVolume: number; // 0..1

  setMuted: (v: boolean) => void;
  setMasterVolume: (v: number) => void;
  setEffectsVolume: (v: number) => void;
};

export const useAudioStore = create<AudioState>((set) => ({
  muted: false,
  masterVolume: 1,
  effectsVolume: 1,

  setMuted: (muted) => set({ muted }),
  setMasterVolume: (masterVolume) => set({ masterVolume }),
  setEffectsVolume: (effectsVolume) => set({ effectsVolume }),
}));
