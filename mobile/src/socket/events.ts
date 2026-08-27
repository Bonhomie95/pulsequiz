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

  /* -------- REMATCH -------- */
  REMATCH_REQUEST: 'rematch:request',
  REMATCH_ACCEPTED: 'rematch:accepted',
  REMATCH_DECLINED: 'rematch:declined',

  /* -------- ROOM (Play With Friends) -------- */
  ROOM_JOIN: 'room:join',
  ROOM_GUEST_JOINED: 'room:guest_joined',
  ROOM_CANCELLED: 'room:cancelled',

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
};

export type MatchFoundPayload = {
  matchId: string;
  players: PvPPlayer[];
  wager?: number;
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
export type MatchFinishedPayload = { winnerUserId: string };
export type RoomGuestJoinedPayload = {
  matchId: string;
  players?: PvPPlayer[];
  wager?: number;
};
export type SocketErrorPayload = { message: string };
