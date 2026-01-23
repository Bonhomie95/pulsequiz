export const SOCKET_EVENTS = {
  /* -------- MATCHMAKING -------- */
  JOIN_QUEUE: 'queue:join',
  LEAVE_QUEUE: 'queue:leave',
  QUEUED: 'queue:queued',
  QUEUE_TIMEOUT: 'queue:timeout',

  /* -------- MATCH CREATION -------- */
  MATCH_FOUND: 'match:found',

  /* -------- MATCH LIFECYCLE -------- */
  MATCH_START: 'match:start',
  PLAYER_UPDATE: 'match:player_update',
  WAITING: 'match:waiting',
  MATCH_FINISHED: 'match:finished',

  /* -------- GAMEPLAY -------- */
  ANSWER: 'match:answer',

  /* -------- ERRORS -------- */
  ERROR: 'match:error',
} as const;
