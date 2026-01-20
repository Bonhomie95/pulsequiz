import { create } from 'zustand';

type PlayerSnapshot = {
  userId: string;
  username: string;
  avatar: string;
  level: number;
  allTimeRank: number;
};

type Question = {
  id: string;
  question: string;
  options: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  order: number;
};

type PvPState = {
  status:
    | 'idle'
    | 'searching'
    | 'matched'
    | 'starting'
    | 'playing'
    | 'waiting'
    | 'finished';

  category: string | null;
  matchId: string | null;

  me: PlayerSnapshot | null;
  opponent: PlayerSnapshot | null;

  questions: Question[];
  currentIndex: number;

  winnerUserId: string | null;

  /* actions */
  setSearching: (category: string) => void;
  setMatched: (data: {
    matchId: string;
    players: PlayerSnapshot[];
    myUserId: string;
  }) => void;
  startMatch: (questions: Question[]) => void;
  updateProgress: (payload: any) => void;
  setWaiting: () => void;
  finishMatch: (winnerUserId: string) => void;
  reset: () => void;
};

export const usePvPStore = create<PvPState>((set, get) => ({
  status: 'idle',
  category: null,
  matchId: null,

  me: null,
  opponent: null,

  questions: [],
  currentIndex: 0,
  winnerUserId: null,

  setSearching: (category) =>
    set({ status: 'searching', category }),

  setMatched: ({ matchId, players, myUserId }) => {
    const me = players.find((p) => p.userId === myUserId)!;
    const opponent = players.find((p) => p.userId !== myUserId)!;

    set({
      status: 'matched',
      matchId,
      me,
      opponent,
    });
  },

  startMatch: (questions) =>
    set({
      status: 'playing',
      questions,
      currentIndex: 0,
    }),

  updateProgress: ({ userId, currentIndex }) => {
    const state = get();
    if (state.me?.userId === userId) {
      set({ currentIndex });
    }
  },

  setWaiting: () => set({ status: 'waiting' }),

  finishMatch: (winnerUserId) =>
    set({ status: 'finished', winnerUserId }),

  reset: () =>
    set({
      status: 'idle',
      category: null,
      matchId: null,
      me: null,
      opponent: null,
      questions: [],
      currentIndex: 0,
      winnerUserId: null,
    }),
}));
