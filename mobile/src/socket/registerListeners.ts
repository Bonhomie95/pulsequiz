import { getSocket } from './socket';
import { SOCKET_EVENTS } from './events';
import { usePvPStore } from '@/src/store/usePvPStore';
import { useAuthStore } from '@/src/store/useAuthStore';

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

export function registerPvPSocketListeners() {
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

  socket.on(SOCKET_EVENTS.MATCH_FOUND, (payload) => {
    const myUserId = useAuthStore.getState().user!.id;
    usePvPStore.getState().setMatched({
      matchId: payload.matchId,
      players: payload.players,
      myUserId,
    });
  });

  socket.on(SOCKET_EVENTS.MATCH_START, (payload) => {
    usePvPStore.getState().startMatch(payload.questions);
  });

  socket.on(SOCKET_EVENTS.PLAYER_UPDATE, (payload) => {
    usePvPStore.getState().updateProgress(payload);
  });

  socket.on(SOCKET_EVENTS.WAITING_ON_OPPONENT, () => {
    usePvPStore.getState().setWaiting();
  });

  socket.on(SOCKET_EVENTS.MATCH_FINISHED, (payload) => {
    usePvPStore.getState().finishMatch(payload.winnerUserId);
  });

  socket.on(SOCKET_EVENTS.ERROR, (e) => {
    console.warn('PvP error', e.message);
    usePvPStore.getState().reset();
  });
}
