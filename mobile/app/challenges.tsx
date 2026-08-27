import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Zap, Calendar, CheckCircle2, Clock } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '@/src/api/api';
import { useTheme } from '@/src/theme/useTheme';
import { useCoinStore } from '@/src/store/useCoinStore';
import { showInterstitialAd } from '@/src/ads/admob';

type Challenge = {
  _id: string;
  type: 'daily' | 'weekly';
  title: string;
  description: string;
  targetValue: number;
  currentValue: number;
  rewardCoins: number;
  rewardPoints: number;
  status: 'active' | 'completed' | 'expired';
  expiresAt: string;
};

export default function ChallengesScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [tab, setTab] = useState<'daily' | 'weekly'>('daily');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/challenges');
      setChallenges(res.data.challenges);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const claim = async (ch: Challenge) => {
    if (claiming) return;
    try {
      setClaiming(ch._id);
      // Show interstitial before rewarding
      await showInterstitialAd().catch(() => {});
      const res = await api.post(`/challenges/${ch._id}/claim`);
      useCoinStore.getState().syncFromServer(res.data);
      setChallenges((prev) =>
        prev.map((c) => (c._id === ch._id ? { ...c, status: 'expired' } : c)),
      );
    } catch (e: any) {
      /* silent — maybe already claimed */
    } finally {
      setClaiming(null);
    }
  };

  const filtered = challenges.filter((c) => c.type === tab);
  const daily   = challenges.filter((c) => c.type === 'daily');
  const weekly  = challenges.filter((c) => c.type === 'weekly');
  const doneD   = daily.filter((c)  => c.status === 'completed').length;
  const doneW   = weekly.filter((c) => c.status === 'completed').length;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: theme.colors.surface }]}
        
            accessibilityRole="button"
            hitSlop={8}
            accessibilityLabel="Go back">
          <ChevronLeft size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.text }]}>Challenges</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* ── Tab Bar ── */}
      <View style={[styles.tabs, { backgroundColor: theme.colors.surface }]}>
        {(['daily', 'weekly'] as const).map((t) => {
          const count = t === 'daily' ? doneD : doneW;
          const total = t === 'daily' ? daily.length : weekly.length;
          const active = tab === t;
          return (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={[
                styles.tab,
                active && { backgroundColor: theme.colors.primary },
              ]}
            
            accessibilityRole="button"
            hitSlop={8}
            accessibilityLabel="Add more time">
              {t === 'daily'
                ? <Clock size={15} color={active ? '#fff' : theme.colors.muted} />
                : <Calendar size={15} color={active ? '#fff' : theme.colors.muted} />
              }
              <Text style={[
                styles.tabText,
                { color: active ? '#fff' : theme.colors.muted },
              ]}>
                {t === 'daily' ? 'Daily' : 'Weekly'}
              </Text>
              {total > 0 && (
                <View style={[
                  styles.badge,
                  { backgroundColor: active ? 'rgba(255,255,255,0.25)' : theme.colors.background },
                ]}>
                  <Text style={{ color: active ? '#fff' : theme.colors.muted, fontSize: 11, fontWeight: '700' }}>
                    {count}/{total}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── List ── */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
          <Text style={{ fontSize: 48 }}>🎯</Text>
          <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>No challenges yet</Text>
          <Text style={{ color: theme.colors.muted, textAlign: 'center', marginTop: 8 }}>
            Play a quiz to unlock your {tab} challenges!
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/quiz/categories')}
            style={[styles.playBtn, { backgroundColor: theme.colors.primary }]}
          
            accessibilityRole="button"
            accessibilityLabel="Play Now"
            hitSlop={8}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Play Now</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c._id}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          renderItem={({ item: ch }) => (
            <ChallengeCard
              challenge={ch}
              onClaim={() => claim(ch)}
              claiming={claiming === ch._id}
              theme={theme}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

/* ── Card ── */

function ChallengeCard({
  challenge: ch,
  onClaim,
  claiming,
  theme,
}: {
  challenge: Challenge;
  onClaim: () => void;
  claiming: boolean;
  theme: ReturnType<typeof import('@/src/theme/useTheme').useTheme>;
}) {
  const pct = Math.min((ch.currentValue / ch.targetValue) * 100, 100);
  const done = ch.status === 'completed';
  const expired = ch.status === 'expired';

  return (
    <LinearGradient
      colors={
        done
          ? [theme.colors.primary + 'CC', theme.colors.primary + '66']
          : [theme.colors.surface, theme.colors.surface]
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, expired && { opacity: 0.45 }]}
    >
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: done ? '#fff' : theme.colors.text }]}>
            {ch.title}
          </Text>
          <Text style={[styles.cardDesc, { color: done ? 'rgba(255,255,255,0.8)' : theme.colors.muted }]}>
            {ch.description}
          </Text>
        </View>
        {done && !expired && (
          <CheckCircle2 size={28} color="#fff" />
        )}
      </View>

      {/* progress bar */}
      {!expired && (
        <View style={[styles.progressTrack, { backgroundColor: done ? 'rgba(255,255,255,0.25)' : theme.colors.background }]}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${pct}%` as any,
                backgroundColor: done ? '#fff' : theme.colors.primary,
              },
            ]}
          />
        </View>
      )}

      <View style={styles.cardBottom}>
        <View style={styles.rewardRow}>
          <Text style={[styles.rewardText, { color: done ? '#fff' : theme.colors.coin }]}>
            🪙 {ch.rewardCoins}
          </Text>
          <Text style={[styles.rewardText, { color: done ? 'rgba(255,255,255,0.8)' : theme.colors.muted, marginLeft: 12 }]}>
            +{ch.rewardPoints} pts
          </Text>
        </View>

        {!expired && (
          <Text style={[styles.progress, { color: done ? 'rgba(255,255,255,0.9)' : theme.colors.muted }]}>
            {ch.currentValue}/{ch.targetValue}
          </Text>
        )}
      </View>

      {done && !expired && (
        <TouchableOpacity
          onPress={onClaim}
          disabled={claiming}
          style={[styles.claimBtn, { backgroundColor: 'rgba(255,255,255,0.25)' }]}
        
            accessibilityRole="button"
            accessibilityLabel="Claim Reward"
            hitSlop={8}>
          {claiming ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Zap size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '800', marginLeft: 6 }}>
                Claim Reward
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {expired && (
        <Text style={[styles.claimedLabel, { color: theme.colors.muted }]}>✓ Claimed</Text>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
  title: { fontSize: 20, fontWeight: '800' },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 4,
    marginBottom: 8,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 12,
  },
  tabText: { fontWeight: '700', fontSize: 14 },
  badge: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 8, marginLeft: 2,
  },
  card: {
    borderRadius: 20, padding: 18, marginBottom: 14,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  cardDesc: { fontSize: 13 },
  progressTrack: {
    height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 12,
  },
  progressFill: { height: '100%', borderRadius: 3 },
  cardBottom: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  rewardRow: { flexDirection: 'row', alignItems: 'center' },
  rewardText: { fontWeight: '700', fontSize: 14 },
  progress: { fontSize: 13, fontWeight: '600' },
  claimBtn: {
    marginTop: 14, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', paddingVertical: 12,
    borderRadius: 14,
  },
  claimedLabel: { marginTop: 12, textAlign: 'center', fontSize: 13 },
  emptyTitle: { fontSize: 20, fontWeight: '800', marginTop: 12 },
  playBtn: {
    marginTop: 20, paddingHorizontal: 28, paddingVertical: 14,
    borderRadius: 20,
  },
});
