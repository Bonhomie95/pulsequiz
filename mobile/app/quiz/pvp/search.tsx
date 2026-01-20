import { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';


import { getSocket } from '../../../src/socket/socket';
import { SOCKET_EVENTS } from '../../../src/socket/events';
import { usePvPStore } from '@/src/store/usePvPStore';

export default function PvPSearchScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const router = useRouter();
  const socket = getSocket();

  const { setSearching, reset } = usePvPStore();

  useEffect(() => {
    if (!category) return;

    setSearching(category);

    socket.emit(SOCKET_EVENTS.JOIN_QUEUE, { category });

    socket.on(SOCKET_EVENTS.MATCHED, (payload) => {
      usePvPStore.getState().setMatched(payload);
      router.replace('/quiz/pvp/vs' as any);
    });

    socket.on(SOCKET_EVENTS.QUEUE_TIMEOUT, () => {
      alert('No opponent found. Play normal quiz instead?');
      reset();
      router.replace(`/quiz/play?category=${category}`);
    });

    socket.on(SOCKET_EVENTS.ERROR, (e) => {
      alert(e.message || 'Matchmaking failed');
      reset();
      router.back();
    });

    return () => {
      socket.emit(SOCKET_EVENTS.LEAVE_QUEUE, { category });
      socket.off(SOCKET_EVENTS.MATCHED);
      socket.off(SOCKET_EVENTS.QUEUE_TIMEOUT);
      socket.off(SOCKET_EVENTS.ERROR);
    };
  }, [category]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" />
      <Text style={{ marginTop: 16, fontSize: 16 }}>
        Finding opponent…
      </Text>
      <Text style={{ opacity: 0.6 }}>
        Category: {category}
      </Text>
    </View>
  );
}
