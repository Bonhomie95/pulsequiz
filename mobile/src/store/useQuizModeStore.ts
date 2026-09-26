import { create } from 'zustand';

/** normal = ranked sudden death; relaxed = practice; duel = create a friend challenge. */
export type QuizMode = 'normal' | 'relaxed' | 'pvp' | 'duel';

type State = {
  mode: QuizMode | null;
  setMode: (mode: QuizMode) => void;
  clear: () => void;
};

export const useQuizModeStore = create<State>((set) => ({
  mode: null,
  setMode: (mode) => set({ mode }),
  clear: () => set({ mode: null }),
}));
