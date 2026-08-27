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

  /** A transient, per-action problem (rejected answer, network blip). Shown
   *  in-place rather than ending the match. */
  error: string | null;

  /**
   * The server's deadline for the current question, as an epoch millisecond
   * value. The countdown is derived from this rather than restarted at 15s,
   * so a player reconnecting mid-question sees the time they actually have
   * left instead of a full clock the server will not honour.
   */
  deadlineAt: number | null;

  /* actions */
  setSearching: (category: string) => void;
  setMatched: (data: {
    matchId: string;
    players: PlayerSnapshot[];
    myUserId: string;
    wager?: number;
  }) => void;
  startMatch: (
    questions: Question[],
    resumedAtIndex?: number,
    deadlineAt?: string | number | null,
  ) => void;
  updateProgress: (payload: { userId: string; currentIndex: number }) => void;
  setWaiting: () => void;
  finishMatch: (winnerUserId: string) => void;
  setError: (message: string | null) => void;
  setDeadline: (deadlineAt: string | number | null | undefined) => void;
  reset: () => void;
};

export const usePvPStore = create<PvPState>((set, get) => ({
  status: 'idle',
  category: null,
  error: null,
  deadlineAt: null,
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

  // `resumedAtIndex` is the server's view of where this player actually is.
  // On a reconnect it is non-zero, and honouring it matters: hard-resetting to
  // 0 made the client answer a question the server had already moved past, so
  // every submission came back "Invalid question" and the match was stuck.
  startMatch: (questions, resumedAtIndex = 0, deadlineAt = null) =>
    set({
      status: 'playing',
      error: null,
      deadlineAt: deadlineAt ? new Date(deadlineAt).getTime() : null,
      questions,
      currentIndex: Math.min(Math.max(resumedAtIndex, 0), Math.max(questions.length - 1, 0)),
    }),

  updateProgress: ({ userId, currentIndex }) => {
    const state = get();
    if (state.me?.userId === userId) {
      set({ currentIndex });
    } else {
      set({
        opponentIndex: currentIndex,
        opponentFurthest: Math.max(state.opponentFurthest, currentIndex),
      });
    }
  },

  setWaiting: () => set({ status: 'waiting' }),

  setError: (message) => set({ error: message }),

  setDeadline: (deadlineAt) =>
    set({
      deadlineAt: deadlineAt ? new Date(deadlineAt).getTime() : null,
    }),

  finishMatch: (winnerUserId) => set({ status: 'finished', winnerUserId }),

  reset: () =>
    set({
      status: 'idle',
      category: null,
      error: null,
      deadlineAt: null,
      matchId: null,
      wager: 0,
      me: null,
      opponent: null,
      questions: [],
      currentIndex: 0,
      winnerUserId: null,
    }),
}));
