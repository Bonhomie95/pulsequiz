export const SOCKET_EVENTS = {
  /* ---------------- QUEUE / MATCHMAKING ---------------- */
  JOIN_QUEUE: 'queue:join',
  LEAVE_QUEUE: 'queue:leave',
  QUEUED: 'queue:queued',
  QUEUE_TIMEOUT: 'queue:timeout',

  /* ---------------- MATCH CREATION ---------------- */
  MATCH_FOUND: 'match:found',
  MATCH_CANCELLED: 'match:cancelled',
  MATCH_PING: 'match:ping',

  /* ---------------- MATCH LIFECYCLE ---------------- */
  MATCH_START: 'match:start',
  PLAYER_UPDATE: 'match:player_update',
  WAITING_ON_OPPONENT: 'match:waiting',
  MATCH_FINISHED: 'match:finished',
  MATCH_DRAW: 'match:draw',

  /* ---------------- GAMEPLAY ---------------- */
  ANSWER: 'match:answer',

  /* ---------------- REMATCH ---------------- */
  REMATCH_REQUEST: 'rematch:request',
  REMATCH_ACCEPTED: 'rematch:accepted',
  REMATCH_DECLINED: 'rematch:declined',

  /* ---------------- ROOM (Play With Friends) ---------------- */
  ROOM_JOIN: 'room:join',
  ROOM_GUEST_JOINED: 'room:guest_joined',
  ROOM_CANCELLED: 'room:cancelled',

  /* ---------------- ERRORS ---------------- */
  ERROR: 'match:error',
} as const;
