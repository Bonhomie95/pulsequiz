import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Copy, Coins } from 'lucide-react-native';
import { useTheme } from '@/src/theme/useTheme';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/src/api/api';
import { useCoinStore } from '@/src/store/useCoinStore';
import * as Clipboard from 'expo-clipboard';
import { getSocket } from '@/src/socket/socket';
import { SOCKET_EVENTS } from '@/src/socket/events';
import { useAuthStore } from '@/src/store/useAuthStore';
import { usePvPStore } from '@/src/store/usePvPStore';

const CATEGORIES = [
  'Biology',
  'Chemistry',
  'Geography',
  'History',
  'Math',
  'Physics',
  'Pop Culture',
  'Sports',
  'Technology',
  'Food & Cooking',
  'General Knowledge',
];
const WAGER_OPTIONS = [0, 10, 25, 50, 100, 200, 500];

export default function CreateRoomScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { invite } = useLocalSearchParams<{ invite?: string }>();
  const { coins } = useCoinStore();

  const [category, setCategory] = useState('General Knowledge');
  const [wager, setWager] = useState(0);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Keep a ref to roomCode so the cleanup function can read the latest value
  const roomCodeRef = useRef<string | null>(null);
  roomCodeRef.current = roomCode;

  const socket = getSocket();

  const createRoom = async () => {
    if (wager > coins) {
      Alert.alert(
        'Insufficient Coins',
        `You need ${wager} coins to set this wager. You have ${coins}.`,
      );
      return;
    }
    setCreating(true);
    try {
      const res = await api.post('/rooms/create', { category, wager });
      // FIX: server returns { room: { code, category, wager, roomId } }
      const code: string = res.data.room?.code ?? res.data.code;
      if (!code) throw new Error('No room code in response');
      setRoomCode(code);
    } catch (e: any) {
      Alert.alert(
        'Error',
        e?.response?.data?.message ?? 'Could not create room.',
      );
    } finally {
      setCreating(false);
    }
  };

  // When room code is set, register as host via socket and listen for guest
  useEffect(() => {
    if (!roomCode) return;

    socket.emit(SOCKET_EVENTS.ROOM_JOIN, { code: roomCode });

    const onGuestJoined = (payload: any) => {
      usePvPStore.getState().setMatched({
        matchId: payload.matchId,
        players: payload.players ?? [],
        myUserId: useAuthStore.getState().user!.id,
        wager: payload.wager ?? 0,
      });
      router.replace('/quiz/pvp/vs');
    };

    const onCancelled = () => {
      setRoomCode(null);
      Alert.alert(
        'Room Cancelled',
        'The room was cancelled. Please create a new one.',
      );
    };

    socket.on(SOCKET_EVENTS.ROOM_GUEST_JOINED, onGuestJoined);
    socket.on(SOCKET_EVENTS.ROOM_CANCELLED, onCancelled);

    return () => {
      socket.off(SOCKET_EVENTS.ROOM_GUEST_JOINED, onGuestJoined);
      socket.off(SOCKET_EVENTS.ROOM_CANCELLED, onCancelled);
    };
  }, [roomCode]);

  const cancelRoom = () => {
    // Optimistically clear local state; server TTL / host-disconnect handler will cancel the DB record
    setRoomCode(null);
  };

  const copyCode = async () => {
    if (!roomCode) return;
    await Clipboard.setStringAsync(roomCode);
    Alert.alert('Copied!', `Room code ${roomCode} copied to clipboard.`);
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Play With Friends
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {!roomCode ? (
          <>
            {invite && (
              <View
                style={[
                  styles.inviteNote,
                  { backgroundColor: theme.colors.surface },
                ]}
              >
                <Text style={{ color: theme.colors.primary, fontSize: 13 }}>
                  Inviting <Text style={{ fontWeight: '800' }}>{invite}</Text> —
                  share your code after creating the room
                </Text>
              </View>
            )}

            <Text style={[styles.label, { color: theme.colors.text }]}>
              Category
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 20 }}
            >
              <View style={{ flexDirection: 'row', gap: 8, paddingRight: 16 }}>
                {CATEGORIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setCategory(c)}
                    style={[
                      styles.pill,
                      {
                        backgroundColor:
                          category === c
                            ? theme.colors.primary
                            : theme.colors.surface,
                        borderColor:
                          category === c
                            ? theme.colors.primary
                            : theme.colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: category === c ? '#fff' : theme.colors.text,
                        fontWeight: '600',
                        fontSize: 13,
                      }}
                    >
                      {c}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={[styles.label, { color: theme.colors.text }]}>
              Coin Wager
            </Text>
            <Text style={[styles.sublabel, { color: theme.colors.muted }]}>
              Winner takes both stakes. Set 0 for free play. You have {coins}{' '}
              coins.
            </Text>
            <View style={styles.wagerRow}>
              {WAGER_OPTIONS.map((w) => (
                <TouchableOpacity
                  key={w}
                  onPress={() => setWager(w)}
                  style={[
                    styles.wagerPill,
                    {
                      backgroundColor:
                        wager === w
                          ? theme.colors.coin + '20'
                          : theme.colors.surface,
                      borderColor:
                        wager === w ? theme.colors.coin : theme.colors.border,
                    },
                  ]}
                >
                  <Coins
                    size={12}
                    color={wager === w ? theme.colors.coin : theme.colors.muted}
                  />
                  <Text
                    style={{
                      color:
                        wager === w ? theme.colors.coin : theme.colors.muted,
                      fontWeight: '700',
                      fontSize: 13,
                    }}
                  >
                    {w === 0 ? 'Free' : w}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[
                styles.createBtn,
                { backgroundColor: theme.colors.primary },
              ]}
              onPress={createRoom}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.createBtnText}>Create Room</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <View style={{ alignItems: 'center', paddingTop: 40 }}>
            <Text style={[styles.waitingTitle, { color: theme.colors.text }]}>
              Room Created!
            </Text>
            <Text style={[styles.waitingSub, { color: theme.colors.muted }]}>
              Share this code with your friend
            </Text>

            <TouchableOpacity
              onPress={copyCode}
              style={[
                styles.codeCard,
                { backgroundColor: theme.colors.surface },
              ]}
            >
              <Text style={[styles.code, { color: theme.colors.primary }]}>
                {roomCode}
              </Text>
              <Copy size={18} color={theme.colors.muted} />
            </TouchableOpacity>

            <View
              style={[
                styles.infoCard,
                { backgroundColor: theme.colors.surface },
              ]}
            >
              <Text style={[styles.infoRow, { color: theme.colors.text }]}>
                Category:{' '}
                <Text style={{ color: theme.colors.primary }}>{category}</Text>
              </Text>
              <Text style={[styles.infoRow, { color: theme.colors.text }]}>
                Wager:{' '}
                <Text style={{ color: theme.colors.coin }}>
                  {wager === 0 ? 'Free' : `${wager} coins each`}
                </Text>
              </Text>
            </View>

            <ActivityIndicator
              color={theme.colors.primary}
              style={{ marginTop: 32 }}
            />
            <Text
              style={[
                { color: theme.colors.muted, marginTop: 12, fontSize: 13 },
              ]}
            >
              Waiting for opponent to join…
            </Text>

            <TouchableOpacity
              onPress={cancelRoom}
              style={[styles.cancelBtn, { borderColor: theme.colors.border }]}
            >
              <Text style={{ color: theme.colors.muted, fontWeight: '600' }}>
                Cancel Room
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '800' },
  scroll: { padding: 16, paddingBottom: 100 },
  inviteNote: { padding: 12, borderRadius: 12, marginBottom: 16 },
  label: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  sublabel: { fontSize: 12, marginBottom: 12, marginTop: -6 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  wagerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 28,
  },
  wagerPill: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  createBtn: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  waitingTitle: { fontSize: 24, fontWeight: '900', marginBottom: 6 },
  waitingSub: { fontSize: 14, marginBottom: 24 },
  codeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 32,
    paddingVertical: 20,
    borderRadius: 20,
  },
  code: { fontSize: 36, fontWeight: '900', letterSpacing: 6 },
  infoCard: {
    borderRadius: 14,
    padding: 16,
    marginTop: 16,
    width: '100%',
    gap: 6,
  },
  infoRow: { fontSize: 14 },
  cancelBtn: {
    marginTop: 32,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
});
