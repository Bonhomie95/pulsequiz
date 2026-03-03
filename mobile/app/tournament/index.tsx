import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Trophy, Clock, Users, Coins } from 'lucide-react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { api } from '@/src/api/api';
import { useTheme } from '@/src/theme/useTheme';

type Tournament = {
  _id: string;
  title: string;
  description: string;
  category: string;
  status: 'upcoming' | 'active' | 'finished' | 'cancelled';
  entryFeeCoins: number;
  prizePoolCoins: number;
  maxParticipants: number;
  participants: { userId: string; score: number; rank?: number }[];
  startsAt: string;
  endsAt: string;
  prizeDistribution: { rank: number; coins: number }[];
};

const STATUS_COLOR: Record<string, string> = {
  upcoming: '#FFB800',
  active: '#4ADE80',
  finished: '#A6B0CF',
  cancelled: '#FF5C5C',
};

export default function TournamentListScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [myTournaments, setMyTournaments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const [activeRes, mineRes] = await Promise.all([
            api.get('/tournaments'),
            api.get('/tournaments/mine'),
          ]);
          if (!active) return;
          setTournaments(activeRes.data?.tournaments ?? []);
          const mineIds = (mineRes.data?.tournaments ?? []).map((t: Tournament) => t._id);
          setMyTournaments(mineIds);
        } catch { /* silent */ }
        finally { if (active) setLoading(false); }
      })();
      return () => { active = false; };
    }, [])
  );

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  const timeRemaining = (endsAt: string) => {
    const ms = new Date(endsAt).getTime() - Date.now();
    if (ms <= 0) return 'Ended';
    const hrs = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    return hrs > 0 ? `${hrs}h ${mins}m left` : `${mins}m left`;
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: theme.colors.surface }]}
        >
          <ChevronLeft size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.text }]}>Tournaments</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 40 }} />
      ) : tournaments.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={{ fontSize: 56 }}>🏆</Text>
          <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>No Active Tournaments</Text>
          <Text style={[styles.emptySub, { color: theme.colors.muted }]}>
            Tournaments are created by admins. Check back soon for upcoming competitions!
          </Text>
        </View>
      ) : (
        <FlatList
          data={tournaments}
          keyExtractor={(t) => t._id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          renderItem={({ item }) => {
            const isJoined = myTournaments.includes(item._id);
            const statusColor = STATUS_COLOR[item.status] ?? '#A6B0CF';

            return (
              <TouchableOpacity
                onPress={() => router.push(`/tournament/${item._id}` as any)}
                style={[styles.card, { backgroundColor: theme.colors.surface }]}
              >
                {/* Status Badge */}
                <View style={styles.cardTop}>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor + '25' }]}>
                    <View style={[styles.dot, { backgroundColor: statusColor }]} />
                    <Text style={{ color: statusColor, fontWeight: '700', fontSize: 11, textTransform: 'uppercase' }}>
                      {item.status}
                    </Text>
                  </View>
                  {isJoined && (
                    <View style={[styles.joinedBadge, { backgroundColor: theme.colors.primary + '22' }]}>
                      <Text style={{ color: theme.colors.primary, fontSize: 11, fontWeight: '700' }}>✅ Joined</Text>
                    </View>
                  )}
                </View>

                <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{item.title}</Text>
                <Text style={[styles.cardCategory, { color: theme.colors.primary }]}>{item.category}</Text>

                {item.description ? (
                  <Text style={[styles.cardDesc, { color: theme.colors.muted }]} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}

                {/* Stats */}
                <View style={styles.stats}>
                  <View style={styles.stat}>
                    <Trophy size={14} color={theme.colors.coin} />
                    <Text style={{ color: theme.colors.coin, fontWeight: '700', fontSize: 12 }}>
                      {item.prizePoolCoins.toLocaleString()} coins
                    </Text>
                  </View>
                  <View style={styles.stat}>
                    <Users size={14} color={theme.colors.muted} />
                    <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                      {item.participants.length}/{item.maxParticipants}
                    </Text>
                  </View>
                  {item.entryFeeCoins > 0 && (
                    <View style={styles.stat}>
                      <Coins size={14} color={theme.colors.muted} />
                      <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                        {item.entryFeeCoins} entry
                      </Text>
                    </View>
                  )}
                </View>

                {/* Time */}
                <View style={[styles.timeRow, { borderTopColor: theme.colors.border }]}>
                  <Clock size={12} color={theme.colors.muted} />
                  <Text style={{ color: theme.colors.muted, fontSize: 11 }}>
                    {item.status === 'upcoming'
                      ? `Starts ${formatDate(item.startsAt)}`
                      : item.status === 'active'
                      ? timeRemaining(item.endsAt)
                      : `Ended ${formatDate(item.endsAt)}`}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  emptyTitle: { fontSize: 22, fontWeight: '900' },
  emptySub: { textAlign: 'center', fontSize: 13, lineHeight: 20 },
  card: { borderRadius: 20, padding: 16, marginBottom: 14 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  joinedBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  cardTitle: { fontSize: 18, fontWeight: '900', marginBottom: 2 },
  cardCategory: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  cardDesc: { fontSize: 13, lineHeight: 18, marginBottom: 10 },
  stats: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10, borderTopWidth: 1 },
});
