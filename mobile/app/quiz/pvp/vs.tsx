import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';

import { getSocket } from '@/src/socket/socket';
import { SOCKET_EVENTS } from '../../../src/socket/events';
import { usePvPStore } from '@/src/store/usePvPStore';

export default function PvPVsScreen() {
  const socket = getSocket();
  const router = useRouter();

  const { me, opponent } = usePvPStore();

  useEffect(() => {
    socket.on(SOCKET_EVENTS.START, (payload) => {
      usePvPStore.getState().startMatch(payload.questions);
      router.replace('/quiz/pvp/play' as any);
    });

    return () => {
      socket.off(SOCKET_EVENTS.START);
    };
  }, []);

  if (!me || !opponent) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Setting up match…</Text>
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <Text style={{ fontSize: 20, fontWeight: '800' }}>{me.username}</Text>

      <Text style={{ fontSize: 28, fontWeight: '900' }}>VS</Text>

      <Text style={{ fontSize: 20, fontWeight: '800' }}>
        {opponent.username}
      </Text>

      <Text style={{ marginTop: 20, color: '#888' }}>Preparing questions…</Text>
    </View>
  );
}
