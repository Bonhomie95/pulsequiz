import { create } from 'zustand';
import { QuizQuestion } from '../types/quiz';

type QuizState = {
  sessionId: string | null;
  questions: QuizQuestion[];
  index: number;
  locked: boolean;
  setQuiz: (s: Partial<QuizState>) => void;
  lock: () => void;
  unlock: () => void;
  next: () => void;
  reset: () => void;
};

export const useQuizStore = create<QuizState>((set) => ({
  sessionId: null,
  questions: [],
  index: 0,
  locked: false,

  setQuiz: (s) => set(s),
  lock: () => set({ locked: true }),
  unlock: () => set({ locked: false }),
  next: () => set((s) => ({ index: s.index + 1 })),
  reset: () =>
    set({
      sessionId: null,
      questions: [],
      index: 0,
      locked: false,
    }),
}));
