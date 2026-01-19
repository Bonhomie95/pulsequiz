import { create } from 'zustand';

type AppState = {
  isPlayingQuiz: boolean;
  skipNextInterstitial: boolean;

  setPlayingQuiz: (v: boolean) => void;
  markRewardedAdWatched: () => void;
  clearSkipInterstitial: () => void;
};

export const useAppStateStore = create<AppState>((set) => ({
  isPlayingQuiz: false,
  skipNextInterstitial: false,

  setPlayingQuiz: (v) => set({ isPlayingQuiz: v }),
  markRewardedAdWatched: () => set({ skipNextInterstitial: true }),
  clearSkipInterstitial: () => set({ skipNextInterstitial: false }),
}));
