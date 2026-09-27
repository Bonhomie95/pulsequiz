export const SOCKET_EVENTS = {
  /* -------- MATCHMAKING -------- */
  JOIN_QUEUE: 'queue:join',
  LEAVE_QUEUE: 'queue:leave',
  QUEUED: 'queue:queued',
  QUEUE_TIMEOUT: 'queue:timeout',

  /* -------- MATCH CREATION -------- */
  MATCH_FOUND: 'match:found',
  MATCH_CANCELLED: 'match:cancelled',

  /* -------- MATCH LIFECYCLE -------- */
  MATCH_START: 'match:start',
  PLAYER_UPDATE: 'match:player_update',
  WAITING_ON_OPPONENT: 'match:waiting',
  MATCH_FINISHED: 'match:finished',
  MATCH_DRAW: 'match:draw',

  /* -------- GAMEPLAY -------- */
  ANSWER: 'match:answer',
  MATCH_PING: 'match:ping',
  /** The one 50/50 each player gets per match. */
  HINT: 'match:hint',
  HINT_RESULT: 'match:hint_result',

  /* ---------------- DIRECT CHALLENGE ---------------- */
  /** Challenge a named friend. No room, no code. */
  CHALLENGE_SEND: 'challenge:send',
  CHALLENGE_INCOMING: 'challenge:incoming',
  CHALLENGE_ACCEPT: 'challenge:accept',
  /** Counter-offer: same opponent, different stake or category. */
  CHALLENGE_COUNTER: 'challenge:counter',
  CHALLENGE_DECLINE: 'challenge:decline',
  /** Declined, expired, or they were never reachable. */
  CHALLENGE_CANCELLED: 'challenge:cancelled',
  /** Delivered to the challenger once the invite is out. */
  CHALLENGE_SENT: 'challenge:sent',

  /* -------- REMATCH -------- */
  REMATCH_REQUEST: 'rematch:request',
  REMATCH_ACCEPTED: 'rematch:accepted',
  REMATCH_DECLINED: 'rematch:declined',

  /* -------- ROOM (Play With Friends) -------- */
  ROOM_JOIN: 'room:join',
  ROOM_GUEST_JOINED: 'room:guest_joined',
  ROOM_CANCELLED: 'room:cancelled',
  /** Host backs out of a waiting room. */
  ROOM_LEAVE: 'room:leave',

  /* -------- ERRORS -------- */
  ERROR: 'match:error',
} as const;

// ── Payload shapes for the PvP events the client listens to ──────────────────
export type PvPPlayer = {
  userId: string;
  username: string;
  avatar: string;
  level: number;
  allTimeRank: number;
  points?: number;
};

export type MatchFoundPayload = {
  matchId: string;
  players: PvPPlayer[];
  wager?: number;
  /** The server sends it on every pairing; a rematch cannot be asked for
   *  without it. */
  category?: string | null;
};

export type MatchStartPayload = {
  matchId?: string;
  timePerQuestion?: number;
  /** Server-authoritative deadline for the current question. */
  deadlineAt?: string | null;
  /**
   * Where this player actually is, sent when the server is replaying an
   * in-progress match after a reconnect. Absent (or 0) on a fresh start.
   */
  resumedAtIndex?: number;
  questions: {
    id: string;
    question: string;
    options: string[];
    difficulty: 'easy' | 'medium' | 'hard';
    order: number;
  }[];
};

export type PlayerUpdatePayload = {
  userId: string;
  currentIndex: number;
  furthestIndex?: number;
  ended?: boolean;
  /** Present only on the acting player's own update. */
  correct?: boolean;
  correctIndex?: number;
  timedOut?: boolean;
  /** Server deadline for the next question, ISO string. */
  deadlineAt?: string | null;
};
export type ScorelineEntry = {
  userId: string;
  username: string;
  correct: number;
  answered: number;
  /** Server-measured total answering time — the tiebreak. */
  timeMs: number;
};

/** Why the match is waiting: the opponent has not opened it, or has not
 *  finished answering. */
export type WaitingPayload = { reason?: 'ready' | 'finished' };

export type MatchFinishedPayload = {
  winnerUserId: string;
  scoreline?: ScorelineEntry[];
  /** Equal scores, so the clock decided it. */
  decidedByTime?: boolean;
};
export type RoomGuestJoinedPayload = {
  matchId: string;
  players?: PvPPlayer[];
  wager?: number;
  category?: string | null;
};
export type SocketErrorPayload = { message: string };
