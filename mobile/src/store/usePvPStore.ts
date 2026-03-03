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
  wager: number;

  me: PlayerSnapshot | null;
  opponent: PlayerSnapshot | null;

  questions: Question[];
  currentIndex: number;

  winnerUserId: string | null;
  opponentIndex: number;
  opponentFurthest: number;

  /* actions */
  setSearching: (category: string) => void;
  setMatched: (data: {
    matchId: string;
    players: PlayerSnapshot[];
    myUserId: string;
    wager?: number;
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
  wager: 0,

  me: null,
  opponent: null,

  questions: [],
  currentIndex: 0,
  winnerUserId: null,
  opponentIndex: 0,
  opponentFurthest: 0,

  setSearching: (category) => set({ status: 'searching', category }),

  setMatched: ({ matchId, players, myUserId, wager = 0 }) => {
    const me = players.find((p) => p.userId === myUserId) ?? players[0];
    const opponent = players.find((p) => p.userId !== myUserId) ?? players[1];

    set({
      status: 'matched',
      matchId,
      wager,
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
    } else {
      set({
        opponentIndex: currentIndex,
        opponentFurthest: currentIndex ?? currentIndex,
      });
    }
  },

  setWaiting: () => set({ status: 'waiting' }),

  finishMatch: (winnerUserId) => set({ status: 'finished', winnerUserId }),

  reset: () =>
    set({
      status: 'idle',
      category: null,
      matchId: null,
      wager: 0,
      me: null,
      opponent: null,
      questions: [],
      currentIndex: 0,
      winnerUserId: null,
    }),
}));
