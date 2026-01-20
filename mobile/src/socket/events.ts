export const SOCKET_EVENTS = {
  // matchmaking
  QUEUED: 'pvp:queued',
  QUEUE_TIMEOUT: 'pvp:queue_timeout',
  JOIN_QUEUE: 'pvp:join_queue',
  LEAVE_QUEUE: 'pvp:leave_queue',

  // match lifecycle
  MATCHED: 'pvp:matched',
  START: 'pvp:start',
  PLAYER_UPDATE: 'pvp:player_update',
  WAITING: 'pvp:waiting_on_opponent',
  FINISHED: 'pvp:match_finished',

  // gameplay
  ANSWER: 'pvp:answer',

  // errors
  ERROR: 'pvp:error',
} as const;
