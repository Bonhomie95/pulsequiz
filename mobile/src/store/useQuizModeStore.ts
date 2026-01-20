import { create } from 'zustand';

type QuizMode = 'normal' | 'pvp';

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
