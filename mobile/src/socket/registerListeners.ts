import { getSocket } from './socket';
import { SOCKET_EVENTS } from './events';
import { usePvPStore } from '@/src/store/usePvPStore';
import { useAuthStore } from '@/src/store/useAuthStore';

export function registerPvPSocketListeners() {
  const socket = getSocket();

  socket.on(SOCKET_EVENTS.QUEUED, () => {
    // optional: show spinner
  });

  socket.on(SOCKET_EVENTS.QUEUE_TIMEOUT, () => {
    usePvPStore.getState().reset();
  });

  socket.on(SOCKET_EVENTS.MATCHED, (payload) => {
    const myUserId = useAuthStore.getState().user!.id;

    usePvPStore.getState().setMatched({
      matchId: payload.matchId,
      players: payload.players,
      myUserId,
    });
  });

  socket.on(SOCKET_EVENTS.START, (payload) => {
    usePvPStore.getState().startMatch(payload.questions);
  });

  socket.on(SOCKET_EVENTS.PLAYER_UPDATE, (payload) => {
    usePvPStore.getState().updateProgress(payload);
  });

  socket.on(SOCKET_EVENTS.WAITING, () => {
    usePvPStore.getState().setWaiting();
  });

  socket.on(SOCKET_EVENTS.FINISHED, (payload) => {
    usePvPStore.getState().finishMatch(payload.winnerUserId);
  });

  socket.on(SOCKET_EVENTS.ERROR, (e) => {
    console.warn('PvP error', e.message);
    usePvPStore.getState().reset();
  });
}
