import { getSocket } from './socket';
import {
  SOCKET_EVENTS,
  type MatchFoundPayload,
  type MatchStartPayload,
  type PlayerUpdatePayload,
  type MatchFinishedPayload,
  type SocketErrorPayload,
} from './events';
import { usePvPStore } from '@/src/store/usePvPStore';
import { useAuthStore } from '@/src/store/useAuthStore';
import { logger } from '@/src/utils/logger';

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
// Guard against double registration. Without this, remounting the screen that
// calls this function stacks duplicate socket.io handlers, so every MATCH_FOUND
// / PLAYER_UPDATE etc. mutates the store multiple times per event.
let listenersRegistered = false;

export function registerPvPSocketListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  const socket = getSocket();

  const onConnect = () => {
    const matchId = usePvPStore.getState().matchId;
    if (matchId) {
      socket.emit(SOCKET_EVENTS.MATCH_START, { matchId });
    }

    // Start heartbeat: ping server every 60s so lastSeenAt stays fresh
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('ping:heartbeat');
      }
    }, 60_000);
  };

  const onDisconnect = () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  };

  socket.on('connect', onConnect);
  socket.on('disconnect', onDisconnect);

  socket.on(SOCKET_EVENTS.QUEUED, () => {
    // optional: show spinner
  });

  socket.on(SOCKET_EVENTS.QUEUE_TIMEOUT, () => {
    usePvPStore.getState().reset();
  });

  socket.on(SOCKET_EVENTS.MATCH_FOUND, (payload: MatchFoundPayload) => {
    const myUserId = useAuthStore.getState().user?.id;
    if (!myUserId) return; // stray event after logout — nothing to match
    usePvPStore.getState().setMatched({
      matchId: payload.matchId,
      players: payload.players,
      myUserId,
      wager: payload.wager,
    });
  });

  socket.on(SOCKET_EVENTS.MATCH_START, (payload: MatchStartPayload) => {
    // On a reconnect the server tells us where this player actually is, and
    // how long is genuinely left on their current question.
    usePvPStore
      .getState()
      .startMatch(payload.questions, payload.resumedAtIndex ?? 0, payload.deadlineAt);
  });

  socket.on(SOCKET_EVENTS.PLAYER_UPDATE, (payload: PlayerUpdatePayload) => {
    usePvPStore.getState().updateProgress(payload);
    // Only our own updates carry a deadline for the next question.
    if (payload.userId === useAuthStore.getState().user?.id) {
      usePvPStore.getState().setDeadline(payload.deadlineAt ?? null);
    }
  });

  socket.on(SOCKET_EVENTS.WAITING_ON_OPPONENT, () => {
    usePvPStore.getState().setWaiting();
  });

  socket.on(SOCKET_EVENTS.MATCH_FINISHED, (payload: MatchFinishedPayload) => {
    usePvPStore.getState().finishMatch(payload.winnerUserId);
  });

  socket.on(SOCKET_EVENTS.ERROR, (e: SocketErrorPayload) => {
    logger.warn('PvP error', e?.message);

    const status = usePvPStore.getState().status;
    const inMatch = status === 'playing' || status === 'waiting';

    // Tearing the store down mid-match would eject the player from a game they
    // are still in — and with coins staked. A rejected answer ("too fast",
    // "invalid question") is a per-action problem, not a reason to abandon the
    // match. Only pre-match failures (queueing, wager staking) end the session.
    if (inMatch) {
      usePvPStore.getState().setError(e?.message ?? 'Something went wrong.');
      return;
    }

    usePvPStore.getState().reset();
  });
}
