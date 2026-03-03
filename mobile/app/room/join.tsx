import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Hash } from 'lucide-react-native';
import { useTheme } from '@/src/theme/useTheme';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { api } from '@/src/api/api';
import { getSocket } from '@/src/socket/socket';
import { SOCKET_EVENTS } from '@/src/socket/events';
import { useAuthStore } from '@/src/store/useAuthStore';
import { usePvPStore } from '@/src/store/usePvPStore';

export default function JoinRoomScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const socket = getSocket();

  const joinRoom = async () => {
    const clean = code.trim().toUpperCase();
    if (clean.length !== 6) {
      Alert.alert('Invalid Code', 'Room codes are 6 characters long.');
      return;
    }
    setJoining(true);
    try {
      // Validate room exists via REST
      const res = await api.post('/rooms/join', { code: clean });
      if (!res.data?.room) {
        Alert.alert('Error', 'Room not found or already started.');
        setJoining(false);
        return;
      }

      // Register as guest via socket — this triggers match creation on server
      socket.emit(SOCKET_EVENTS.ROOM_JOIN, { code: clean });

      // Listen for match created
      socket.once(SOCKET_EVENTS.ROOM_GUEST_JOINED, (payload: any) => {
        usePvPStore.getState().setMatched({
          matchId: payload.matchId,
          players: payload.players ?? [],
          myUserId: useAuthStore.getState().user!.id,
          wager: payload.wager ?? 0,
        });
        router.replace('/quiz/pvp/vs');
      });

      socket.once(SOCKET_EVENTS.ROOM_CANCELLED, () => {
        Alert.alert('Room Cancelled', 'The host cancelled the room.');
        setJoining(false);
      });

      socket.once(SOCKET_EVENTS.ERROR, (err: any) => {
        Alert.alert('Error', err?.message ?? 'Could not join room.');
        setJoining(false);
      });

    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not join room. Check the code and try again.');
      setJoining(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.text }]}>Join Room</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.body}>
          <View style={[styles.iconContainer, { backgroundColor: theme.colors.surface }]}>
            <Hash size={48} color={theme.colors.primary} />
          </View>

          <Text style={[styles.heading, { color: theme.colors.text }]}>Enter Room Code</Text>
          <Text style={[styles.sub, { color: theme.colors.muted }]}>
            Ask your friend for their 6-character room code
          </Text>

          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            placeholder='ABC123'
            placeholderTextColor={theme.colors.muted}
            maxLength={6}
            autoCapitalize='characters'
            autoFocus
            style={[styles.input, {
              backgroundColor: theme.colors.surface,
              color: theme.colors.text,
              borderColor: code.length === 6 ? theme.colors.primary : theme.colors.border,
            }]}
          />

          <TouchableOpacity
            style={[styles.joinBtn, {
              backgroundColor: code.length === 6 ? theme.colors.primary : theme.colors.border,
            }]}
            onPress={joinRoom}
            disabled={joining || code.length !== 6}
          >
            {joining
              ? <ActivityIndicator color='#fff' />
              : <Text style={styles.joinBtnText}>Join Game</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 8 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  iconContainer: { width: 96, height: 96, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  heading: { fontSize: 24, fontWeight: '900', marginBottom: 8 },
  sub: { fontSize: 14, textAlign: 'center', marginBottom: 32, lineHeight: 20 },
  input: { width: '100%', textAlign: 'center', fontSize: 36, fontWeight: '900', letterSpacing: 8, paddingVertical: 20, borderRadius: 16, borderWidth: 2, marginBottom: 24 },
  joinBtn: { width: '100%', height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  joinBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
