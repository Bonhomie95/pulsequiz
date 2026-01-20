import { useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';

import { getSocket } from '@/src/socket/socket';
import { SOCKET_EVENTS } from '../../../src/socket/events';
import { usePvPStore } from '@/src/store/usePvPStore';

export default function PvPPlayScreen() {
  const socket = getSocket();
  const router = useRouter();

  const { matchId, questions, currentIndex, status } = usePvPStore();

  const question = questions[currentIndex];

  useEffect(() => {
    socket.on(SOCKET_EVENTS.PLAYER_UPDATE, (payload) => {
      usePvPStore.getState().updateProgress(payload);
    });

    socket.on(SOCKET_EVENTS.WAITING, () => {
      usePvPStore.getState().setWaiting();
    });

    socket.on(SOCKET_EVENTS.FINISHED, (payload) => {
      usePvPStore.getState().finishMatch(payload.winnerUserId);
      router.replace('/quiz/pvp/result' as any);
    });

    return () => {
      socket.off(SOCKET_EVENTS.PLAYER_UPDATE);
      socket.off(SOCKET_EVENTS.WAITING);
      socket.off(SOCKET_EVENTS.FINISHED);
    };
  }, []);

  if (!question) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Waiting for question…</Text>
      </View>
    );
  }

  const answer = (index: number) => {
    if (!matchId) return;

    socket.emit(SOCKET_EVENTS.ANSWER, {
      matchId,
      questionId: question.id,
      selected: index,
      index: currentIndex,
      elapsedMs: 0, // hook timer later
    });
  };

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 16 }}>
        {question.question}
      </Text>

      {question.options.map((opt, i) => (
        <TouchableOpacity
          key={i}
          onPress={() => answer(i)}
          style={{
            padding: 14,
            marginTop: 12,
            borderRadius: 12,
            backgroundColor: '#222',
          }}
        >
          <Text style={{ color: '#fff' }}>{opt}</Text>
        </TouchableOpacity>
      ))}

      {status === 'waiting' && (
        <Text style={{ marginTop: 20, color: '#aaa', textAlign: 'center' }}>
          Opponent still answering…
        </Text>
      )}
    </View>
  );
}
