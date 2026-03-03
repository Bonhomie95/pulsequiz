import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Trophy, Clock, Users, Coins, Swords } from 'lucide-react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '@/src/api/api';
import { useCoinStore } from '@/src/store/useCoinStore';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useTheme } from '@/src/theme/useTheme';

type Participant = {
  userId: string;
  usernameSnapshot: string;
  score: number;
  rank?: number;
};

type Tournament = {
  _id: string;
  title: string;
  description: string;
  category: string;
  status: 'upcoming' | 'active' | 'finished' | 'cancelled';
  entryFeeCoins: number;
  prizePoolCoins: number;
  maxParticipants: number;
  participants: Participant[];
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

export default function TournamentDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = useAuthStore((s) => s.user?.id);
  const { coins } = useCoinStore();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const res = await api.get(`/tournaments/${id}`);
          if (!active) return;
          setTournament(res.data?.tournament ?? null);
        } catch {
          router.back();
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => { active = false; };
    }, [id])
  );

  const isJoined = tournament?.participants.some((p) => p.userId === userId);

  const join = async () => {
    if (!tournament) return;
    if (tournament.entryFeeCoins > coins) {
      Alert.alert('Insufficient Coins', `You need ${tournament.entryFeeCoins} coins to join. You have ${coins}.`);
      return;
    }

    Alert.alert(
      'Join Tournament',
      tournament.entryFeeCoins > 0
        ? `Entry fee: ${tournament.entryFeeCoins} coins. Are you sure?`
        : 'Join this tournament? It\'s free!',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Join',
          onPress: async () => {
            setJoining(true);
            try {
              await api.post(`/tournaments/${id}/join`);
              if (tournament.entryFeeCoins > 0) {
                useCoinStore.getState().addCoins(-tournament.entryFeeCoins);
              }
              const res = await api.get(`/tournaments/${id}`);
              setTournament(res.data?.tournament ?? null);
              Alert.alert('🎉 Joined!', 'You\'ve joined the tournament. Play now to earn points!');
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.message ?? 'Could not join tournament');
            } finally {
              setJoining(false);
            }
          },
        },
      ]
    );
  };

  const play = () => {
    if (!tournament) return;
    router.push(`/quiz/play?category=${encodeURIComponent(tournament.category)}&tournamentId=${tournament._id}` as any);
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  if (!tournament) return null;

  const sortedParticipants = [...tournament.participants].sort((a, b) => b.score - a.score);
  const statusColor = STATUS_COLOR[tournament.status] ?? '#A6B0CF';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: theme.colors.surface }]}
        >
          <ChevronLeft size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
          {tournament.title}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {/* Status + Category */}
        <View style={styles.badgeRow}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '25' }]}>
            <View style={[styles.dot, { backgroundColor: statusColor }]} />
            <Text style={{ color: statusColor, fontWeight: '700', fontSize: 12, textTransform: 'uppercase' }}>
              {tournament.status}
            </Text>
          </View>
          <View style={[styles.catBadge, { backgroundColor: theme.colors.primary + '22' }]}>
            <Text style={{ color: theme.colors.primary, fontWeight: '700', fontSize: 12 }}>
              {tournament.category}
            </Text>
          </View>
        </View>

        {tournament.description ? (
          <Text style={[styles.desc, { color: theme.colors.muted }]}>{tournament.description}</Text>
        ) : null}

        {/* Stats Cards */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: theme.colors.surface }]}>
            <Trophy size={20} color={theme.colors.coin} />
            <Text style={[styles.statValue, { color: theme.colors.coin }]}>
              {tournament.prizePoolCoins.toLocaleString()}
            </Text>
            <Text style={[styles.statLabel, { color: theme.colors.muted }]}>Prize Pool</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.colors.surface }]}>
            <Users size={20} color={theme.colors.text} />
            <Text style={[styles.statValue, { color: theme.colors.text }]}>
              {tournament.participants.length}/{tournament.maxParticipants}
            </Text>
            <Text style={[styles.statLabel, { color: theme.colors.muted }]}>Players</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.colors.surface }]}>
            <Coins size={20} color={tournament.entryFeeCoins > 0 ? theme.colors.coin : '#4ADE80'} />
            <Text style={[styles.statValue, { color: tournament.entryFeeCoins > 0 ? theme.colors.coin : '#4ADE80' }]}>
              {tournament.entryFeeCoins > 0 ? tournament.entryFeeCoins : 'Free'}
            </Text>
            <Text style={[styles.statLabel, { color: theme.colors.muted }]}>Entry Fee</Text>
          </View>
        </View>

        {/* Timing */}
        <View style={[styles.timeCard, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.timeRow}>
            <Clock size={14} color={theme.colors.muted} />
            <Text style={{ color: theme.colors.muted, fontSize: 13 }}>
              Starts: {formatDate(tournament.startsAt)}
            </Text>
          </View>
          <View style={styles.timeRow}>
            <Clock size={14} color={theme.colors.muted} />
            <Text style={{ color: theme.colors.muted, fontSize: 13 }}>
              Ends: {formatDate(tournament.endsAt)}
            </Text>
          </View>
        </View>

        {/* Prize Distribution */}
        {tournament.prizeDistribution.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>🏆 Prize Distribution</Text>
            <View style={[styles.prizeCard, { backgroundColor: theme.colors.surface }]}>
              {tournament.prizeDistribution.map((p) => (
                <View key={p.rank} style={styles.prizeRow}>
                  <Text style={{ fontSize: 20 }}>{p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `#${p.rank}`}</Text>
                  <Text style={[styles.prizeRank, { color: theme.colors.text }]}>Rank #{p.rank}</Text>
                  <Text style={[styles.prizeCoin, { color: theme.colors.coin }]}>🪙 {p.coins.toLocaleString()} coins</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Leaderboard */}
        {sortedParticipants.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>📊 Current Standings</Text>
            <View style={[styles.leaderboard, { backgroundColor: theme.colors.surface }]}>
              {sortedParticipants.slice(0, 20).map((p, i) => {
                const isMe = p.userId === userId;
                return (
                  <View
                    key={p.userId}
                    style={[
                      styles.lbRow,
                      {
                        backgroundColor: isMe ? theme.colors.primary + '22' : 'transparent',
                        borderBottomColor: theme.colors.border,
                        borderBottomWidth: i < sortedParticipants.length - 1 ? 1 : 0,
                      },
                    ]}
                  >
                    <Text style={{ color: theme.colors.muted, width: 28, fontSize: 13, fontWeight: '700' }}>
                      #{i + 1}
                    </Text>
                    <Text style={[styles.lbName, { color: isMe ? theme.colors.primary : theme.colors.text }]}>
                      {p.usernameSnapshot}{isMe ? ' (You)' : ''}
                    </Text>
                    <Text style={{ color: theme.colors.coin, fontWeight: '800', fontSize: 14 }}>
                      {p.score}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      {/* CTA Button */}
      {(tournament.status === 'upcoming' || tournament.status === 'active') && (
        <View style={[styles.ctaContainer, { backgroundColor: theme.colors.background, borderTopColor: theme.colors.border }]}>
          {isJoined ? (
            tournament.status === 'active' ? (
              <TouchableOpacity
                onPress={play}
                style={[styles.ctaBtn, { backgroundColor: theme.colors.primary }]}
              >
                <Swords size={20} color="#fff" />
                <Text style={styles.ctaBtnText}>Play Now!</Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.ctaBtn, { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }]}>
                <Clock size={20} color={theme.colors.muted} />
                <Text style={[styles.ctaBtnText, { color: theme.colors.muted }]}>
                  Waiting for tournament to start...
                </Text>
              </View>
            )
          ) : (
            <TouchableOpacity
              onPress={join}
              disabled={joining || tournament.participants.length >= tournament.maxParticipants}
              style={[
                styles.ctaBtn,
                {
                  backgroundColor: tournament.participants.length >= tournament.maxParticipants
                    ? theme.colors.surface
                    : theme.colors.primary,
                },
              ]}
            >
              {joining ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Trophy size={20} color={tournament.participants.length >= tournament.maxParticipants ? theme.colors.muted : '#fff'} />
                  <Text style={[
                    styles.ctaBtnText,
                    { color: tournament.participants.length >= tournament.maxParticipants ? theme.colors.muted : '#fff' },
                  ]}>
                    {tournament.participants.length >= tournament.maxParticipants
                      ? 'Tournament Full'
                      : tournament.entryFeeCoins > 0
                      ? `Join for ${tournament.entryFeeCoins} coins`
                      : 'Join Free'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
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
  title: { fontSize: 18, fontWeight: '800', flex: 1, textAlign: 'center' },
  badgeRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  catBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  desc: { fontSize: 14, lineHeight: 21, marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statCard: { flex: 1, borderRadius: 16, padding: 14, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 18, fontWeight: '900' },
  statLabel: { fontSize: 11, textAlign: 'center' },
  timeCard: { borderRadius: 16, padding: 14, gap: 8, marginBottom: 16 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 10, marginTop: 6 },
  prizeCard: { borderRadius: 16, padding: 14, marginBottom: 16 },
  prizeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  prizeRank: { flex: 1, fontWeight: '700', fontSize: 14 },
  prizeCoin: { fontWeight: '800', fontSize: 14 },
  leaderboard: { borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
  lbRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  lbName: { flex: 1, fontSize: 14, fontWeight: '600' },
  ctaContainer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, paddingBottom: 32, borderTopWidth: 1,
  },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 18, borderRadius: 20,
  },
  ctaBtnText: { color: '#fff', fontSize: 17, fontWeight: '900' },
});
