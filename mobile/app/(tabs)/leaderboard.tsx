import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';

import { api, errorMessage } from '@/src/api/api';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useTheme } from '@/src/theme/useTheme';
import { enterImmersiveMode } from '@/src/utils/immersive';
import { UserAvatar } from '@/src/components/UserAvatar';

type Tab = 'weekly' | 'monthly' | 'all' | 'friends';

type Entry = {
  userId: string;
  username: string;
  avatar?: string;
  points: number;
  rank?: number;
  previousRank?: number;
};

// ── Countdown helpers ──────────────────────────────────────────────────────────

function getNextPayoutDate(type: 'weekly' | 'monthly'): Date {
  const now = new Date();

  if (type === 'weekly') {
    // Next Sunday 23:59:59
    const d = new Date(now);
    const daysUntilSunday = (7 - d.getDay()) % 7 || 7;
    d.setDate(d.getDate() + daysUntilSunday);
    d.setHours(23, 59, 59, 0);
    return d;
  }

  // Monthly: last day of current month at 23:59:59
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 0);
}

function formatCountdown(ms: number): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
} {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return { days, hours, minutes, seconds };
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

// ── Countdown Banner ──────────────────────────────────────────────────────────

function CountdownBanner({
  type,
  theme,
}: {
  type: 'weekly' | 'monthly';
  theme: any;
}) {
  const [remaining, setRemaining] = useState(
    () => getNextPayoutDate(type).getTime() - Date.now(),
  );
  const pulseAnim = useRef(new Animated.Value(1)).current;
  // Tab screens stay mounted when you switch tabs, so gate the per-second
  // ticker and the pulse loop on focus — otherwise they keep running (and
  // heating the phone) while you're on another tab.
  const isFocused = useIsFocused();

  // Tick every second. Recompute immediately on `type` change so the timer
  // switches instantly instead of showing the previous tab's value for ~1s.
  useEffect(() => {
    if (!isFocused) return;
    setRemaining(getNextPayoutDate(type).getTime() - Date.now());
    const id = setInterval(() => {
      setRemaining(getNextPayoutDate(type).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, [type, isFocused]);

  // Pulse the colon separators (only while the screen is visible)
  useEffect(() => {
    if (!isFocused) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isFocused, pulseAnim]);

  const { days, hours, minutes, seconds } = formatCountdown(remaining);
  const isUrgent = remaining < 24 * 60 * 60 * 1000; // under 24h
  const isVeryUrgent = remaining < 60 * 60 * 1000; // under 1h

  const gradColors: [string, string] = isVeryUrgent
    ? ['#7F1D1D', '#991B1B']
    : isUrgent
      ? ['#78350F', '#92400E']
      : ['#1E1B4B', '#312E81'];

  return (
    <LinearGradient
      colors={gradColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.countdownBanner}
    >
      {/* Top row */}
      <View style={styles.countdownTop}>
        <Text style={styles.countdownEmoji}>
          {isVeryUrgent ? '🔥' : isUrgent ? '⚡' : '🏆'}
        </Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.countdownTitle}>
            {isVeryUrgent
              ? 'FINAL HOURS!'
              : isUrgent
                ? 'ENDING SOON'
                : `${type === 'weekly' ? 'WEEKLY' : 'MONTHLY'} PAYOUT`}
          </Text>
          <Text style={styles.countdownSub}>
            {isVeryUrgent
              ? 'Play NOW to secure your prize position!'
              : isUrgent
                ? 'Less than 24h left — climb the leaderboard!'
                : `Prizes paid to top players every ${type === 'weekly' ? 'week' : 'month'}`}
          </Text>
        </View>
      </View>

      {/* Timer digits */}
      <View style={styles.timerRow}>
        {days > 0 && (
          <>
            <TimeUnit value={days} label="DAYS" urgent={isUrgent} />
            <Animated.Text style={[styles.colon, { opacity: pulseAnim }]}>
              :
            </Animated.Text>
          </>
        )}
        <TimeUnit value={hours} label="HRS" urgent={isUrgent} />
        <Animated.Text style={[styles.colon, { opacity: pulseAnim }]}>
          :
        </Animated.Text>
        <TimeUnit value={minutes} label="MIN" urgent={isUrgent} />
        <Animated.Text style={[styles.colon, { opacity: pulseAnim }]}>
          :
        </Animated.Text>
        <TimeUnit value={seconds} label="SEC" urgent={isUrgent} />
      </View>
    </LinearGradient>
  );
}

function TimeUnit({
  value,
  label,
  urgent,
}: {
  value: number;
  label: string;
  urgent: boolean;
}) {
  return (
    <View style={styles.timeUnit}>
      <Text style={[styles.timeValue, urgent && styles.timeValueUrgent]}>
        {pad(value)}
      </Text>
      <Text style={styles.timeLabel}>{label}</Text>
    </View>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function AvatarBubble({
  avatar,
  size = 40,
}: {
  avatar?: string;
  size?: number;
}) {
  if (avatar) {
    return <UserAvatar avatar={avatar} size={size} />;
  }
  return (
    <View
      style={[
        styles.avatarFallback,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={{ fontSize: size * 0.45 }}>🎮</Text>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function LeaderboardScreen() {
  const theme = useTheme();
  const userId = useAuthStore((s) => s.user?.id);
  const listRef = useRef<FlatList<Entry>>(null);

  const podiumAnim = useRef(new Animated.Value(0)).current;
  const jumpAnim = useRef(new Animated.Value(0)).current;

  const [tab, setTab] = useState<Tab>('weekly');
  const [data, setData] = useState<Entry[]>([]);
  const [myIndex, setMyIndex] = useState<number | null>(null);
  // The board only stores the top 100. `me` carries the caller's real standing
  // so a player at #412 sees where they are instead of a blank screen.
  const [me, setMe] = useState<{
    rank: number | null;
    points: number;
    pointsToPaidTier: number | null;
    pointsToBoard: number | null;
    outsideBoard?: boolean;
    inTopList?: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prizeInfo, setPrizeInfo] = useState<{
    paidRanks: number;
    totalAmount: number | null;
    tiers: { rank: number; amount: number }[] | null;
    revealed: boolean;
  } | null>(null);

  function getDateRange(type: 'weekly' | 'monthly' | 'all') {
    const now = new Date();
    if (type === 'all') return 'All time';
    if (type === 'weekly') {
      const start = new Date(now);
      start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return `${start.toDateString()} – ${end.toDateString()}`;
    }
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return `${start.toDateString()} – ${end.toDateString()}`;
  }

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      setError(null);

      try {
        let list: Entry[] = [];
        let prizeData = null;
        let standing = null;

        if (tab === 'friends') {
          const [friendsRes, lbRes] = await Promise.all([
            api.get('/friends'),
            api.get('/leaderboard/all'),
          ]);
          const friendIds = new Set(
            (friendsRes.data?.friends ?? []).map((f: any) => f._id?.toString()),
          );
          const allData: Entry[] = lbRes.data?.data ?? [];
          list = allData.filter(
            (e) => e.userId === userId || friendIds.has(e.userId),
          );
        } else {
          const res = await api.get(`/leaderboard/${tab}`);
          list = res.data?.data ?? [];
          prizeData = res.data?.prizeInfo ?? null;
          standing = res.data?.me ?? null;
        }

        setData(list);
        setPrizeInfo(prizeData);
        setMe(standing);

        const idx = list.findIndex((u) => u.userId === userId);
        setMyIndex(idx >= 0 ? idx : null);

        podiumAnim.setValue(0);
        Animated.spring(podiumAnim, {
          toValue: 1,
          useNativeDriver: true,
          friction: 6,
        }).start();
        Animated.timing(jumpAnim, {
          toValue: idx >= 3 ? 1 : 0,
          duration: 300,
          useNativeDriver: true,
        }).start();
      } catch (e) {
        // A failed fetch used to be swallowed into console.error, leaving an
        // empty list the user couldn't tell apart from "nobody has played".
        setError(errorMessage(e, "Couldn't load the leaderboard."));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tab, userId, podiumAnim, jumpAnim],
  );

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Refetch whenever the tab is focused.
   *
   * Tab screens stay mounted when you switch away, so the mount-only effect
   * above ran once and never again — coming back from a quiz showed whatever
   * was fetched the first time this tab opened, which could be far staler than
   * the cron's one-minute cadence. Silent, because a spinner on every tab
   * switch is worse than a brief moment of previous data.
   */
  useFocusEffect(
    useCallback(() => {
      enterImmersiveMode();
      load({ silent: true });
    }, [load]),
  );

  const scrollToMe = () => {
    if (myIndex == null || myIndex < 3) return;
    listRef.current?.scrollToIndex({
      index: myIndex - 3,
      animated: true,
      viewPosition: 0.5,
    });
  };

  const podium = data.slice(0, 3);
  const rest = data.slice(3);

  return (
    <SafeAreaView
      edges={['top']}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <View style={styles.container}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Leaderboard 🏆
        </Text>

        {/* ── COUNTDOWN BANNER (weekly / monthly only) ── */}
        {(tab === 'weekly' || tab === 'monthly') && (
          <CountdownBanner type={tab} theme={theme} />
        )}

        {/* PRIZE INFO */}
        {(tab === 'weekly' || tab === 'monthly') && prizeInfo && (
          <View
            style={{
              backgroundColor: '#FFB80015',
              borderWidth: 1,
              borderColor: '#FFB80040',
              borderRadius: 12,
              padding: 10,
              marginBottom: 10,
            }}
          >
            <Text style={{ color: '#FFB800', fontSize: 12, lineHeight: 17 }}>
              {prizeInfo.revealed ? (
                <>
                  <Text style={{ fontWeight: '800' }}>PRIZES REVEALED! </Text>
                  Top {prizeInfo.paidRanks} players earned USDT this{' '}
                  {tab === 'weekly' ? 'week' : 'month'}.
                </>
              ) : prizeInfo.paidRanks ? (
                <>
                  <Text style={{ fontWeight: '800' }}>
                    Top {prizeInfo.paidRanks} players win USDT!{' '}
                  </Text>
                  Keep climbing!
                </>
              ) : (
                <>
                  <Text style={{ fontWeight: '800' }}>
                    USDT prizes revealed after period ends.{' '}
                  </Text>
                  Top players earn real crypto.
                </>
              )}
            </Text>
          </View>
        )}

        <Text
          style={{ color: theme.colors.muted, fontSize: 12, marginBottom: 12 }}
        >
          {getDateRange(tab === 'friends' ? 'all' : tab)}
        </Text>

        {/* TABS */}
        <View style={styles.tabs}>
          {(['weekly', 'monthly', 'all', 'friends'] as Tab[]).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
              accessibilityLabel={`${t} leaderboard`}
              hitSlop={6}
              style={[
                styles.tab,
                {
                  backgroundColor:
                    tab === t ? theme.colors.primary : theme.colors.surface,
                },
              ]}
            >
              <Text
                style={{
                  color: tab === t ? '#fff' : theme.colors.text,
                  fontWeight: '700',
                  fontSize: 12,
                }}
              >
                {t === 'weekly'
                  ? 'Weekly'
                  : t === 'monthly'
                    ? 'Monthly'
                    : t === 'all'
                      ? 'All Time'
                      : '👥 Friends'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* PODIUM */}
        {!loading && !error && data.length > 0 && (
        <View style={styles.podium}>
          {podium[1] && (
            <AnimatedPodiumCard
              place={2}
              data={podium[1]}
              anim={podiumAnim}
              theme={theme}
            />
          )}
          {podium[0] && (
            <AnimatedPodiumCard
              place={1}
              data={podium[0]}
              anim={podiumAnim}
              crown
              theme={theme}
            />
          )}
          {podium[2] && (
            <AnimatedPodiumCard
              place={3}
              data={podium[2]}
              anim={podiumAnim}
              theme={theme}
            />
          )}
        </View>
        )}

        {/* JUMP TO ME */}
        {myIndex != null && myIndex >= 3 && (
          <Animated.View
            style={[
              styles.jumpFloating,
              {
                transform: [
                  {
                    scale: jumpAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 1],
                    }),
                  },
                ],
                opacity: jumpAnim,
              },
            ]}
          >
            <TouchableOpacity
              onPress={scrollToMe}
              accessibilityRole="button"
              accessibilityLabel="Scroll to my position on the leaderboard"
              hitSlop={10}
            >
              <Text style={styles.jumpText}>⬇ Jump to me</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* YOUR STANDING — shown when the player is outside the visible board */}
        {me && !me.inTopList && tab !== 'friends' && (
          <View
            style={[
              styles.standingCard,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
            accessible
            accessibilityLabel={
              me.rank
                ? `You are ranked ${me.rank} with ${me.points} points`
                : 'You are not ranked yet this period'
            }
          >
            <Text style={{ color: theme.colors.muted, fontSize: 12, fontWeight: '700' }}>
              YOUR POSITION
            </Text>
            <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900', marginTop: 4 }}>
              {me.rank ? `#${me.rank}` : me.points > 0 ? 'Just off the board' : 'Unranked'}
              <Text style={{ color: theme.colors.muted, fontSize: 14, fontWeight: '700' }}>
                {'  '}
                {me.points} {me.points === 1 ? 'point' : 'points'}
              </Text>
            </Text>

            {me.points > 0 && me.pointsToBoard != null && me.pointsToBoard > 0 && (
              <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '700', marginTop: 6 }}>
                {me.pointsToBoard} more{' '}
                {me.pointsToBoard === 1 ? 'point' : 'points'} to appear on the board
              </Text>
            )}

            {me.pointsToPaidTier != null && me.pointsToPaidTier > 0 && (
              <Text style={{ color: theme.colors.coin, fontSize: 13, fontWeight: '700', marginTop: 4 }}>
                {me.pointsToPaidTier} more{' '}
                {me.pointsToPaidTier === 1 ? 'point' : 'points'} to reach the prize tier
              </Text>
            )}

            {me.points === 0 && (
              <Text style={{ color: theme.colors.muted, fontSize: 13, marginTop: 6 }}>
                Play a quiz to get on the board.
              </Text>
            )}
          </View>
        )}

        {/* LOADING */}
        {loading && (
          <View style={styles.stateBlock}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={{ color: theme.colors.muted, marginTop: 10, fontSize: 13 }}>
              Loading rankings…
            </Text>
          </View>
        )}

        {/* ERROR */}
        {!loading && error && (
          <View style={styles.stateBlock}>
            <Text style={{ fontSize: 34, marginBottom: 10 }}>📡</Text>
            <Text
              style={{
                color: theme.colors.text,
                fontWeight: '800',
                fontSize: 15,
                marginBottom: 6,
                textAlign: 'center',
              }}
            >
              {error}
            </Text>
            <TouchableOpacity
              onPress={() => load()}
              style={[styles.retryBtn, { backgroundColor: theme.colors.primary }]}
              accessibilityRole="button"
              accessibilityLabel="Retry loading the leaderboard"
              hitSlop={8}
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* EMPTY — nobody has scored yet this period */}
        {!loading && !error && tab !== 'friends' && data.length === 0 && (
          <View style={styles.stateBlock}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>🏁</Text>
            <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 16, marginBottom: 6 }}>
              Nobody has scored yet
            </Text>
            <Text style={{ color: theme.colors.muted, textAlign: 'center', fontSize: 13 }}>
              {tab === 'all'
                ? 'Be the first on the all-time board.'
                : `Play a quiz to take the top spot this ${tab === 'weekly' ? 'week' : 'month'}.`}
            </Text>
          </View>
        )}

        {/* EMPTY FRIENDS */}
        {!loading && !error && tab === 'friends' && data.length === 0 && (
          <View style={{ alignItems: 'center', padding: 24 }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>👥</Text>
            <Text
              style={{
                color: theme.colors.text,
                fontWeight: '700',
                fontSize: 16,
                marginBottom: 8,
              }}
            >
              No Friends Yet
            </Text>
            <Text
              style={{
                color: theme.colors.muted,
                textAlign: 'center',
                fontSize: 13,
              }}
            >
              Add friends via the Friends screen to see how you compare!
            </Text>
          </View>
        )}

        {/* LIST */}
        <FlatList
          ref={listRef}
          data={loading || error ? [] : rest}
          keyExtractor={(i) => i.userId}
          contentContainerStyle={{ paddingBottom: 80 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load({ silent: true });
              }}
              tintColor={theme.colors.primary}
            />
          }
          renderItem={({ item, index }) => {
            const rank = index + 4;
            const isMe = item.userId === userId;
            let delta = '•';
            if (item.previousRank != null) {
              if (item.previousRank > rank) delta = '↑';
              else if (item.previousRank < rank) delta = '↓';
            }
            return (
              <View
                accessible
                accessibilityLabel={`Rank ${rank}, ${item.username}, ${item.points} points${isMe ? ', this is you' : ''}`}
                style={[
                  styles.row,
                  {
                    backgroundColor: isMe
                      ? theme.colors.primary
                      : theme.colors.surface,
                    borderColor: isMe
                      ? theme.colors.primary
                      : theme.colors.border,
                    borderWidth: 1,
                  },
                ]}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    flex: 1,
                  }}
                >
                  <AvatarBubble avatar={item.avatar} size={32} />
                  <Text
                    style={{
                      color: isMe ? '#fff' : theme.colors.text,
                      fontWeight: isMe ? '900' : '700',
                    }}
                  >
                    {rank}. {item.username} {delta}
                  </Text>
                </View>
                <Text style={{ color: theme.colors.coin, fontWeight: '800' }}>
                  {item.points}
                </Text>
              </View>
            );
          }}
        />
      </View>
    </SafeAreaView>
  );
}

// ── Podium Card ───────────────────────────────────────────────────────────────

function AnimatedPodiumCard({
  place,
  data,
  anim,
  crown,
  theme,
}: {
  place: 1 | 2 | 3;
  data: Entry;
  anim: Animated.Value;
  crown?: boolean;
  theme: ReturnType<typeof useTheme>;
}) {
  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [30, place === 1 ? -10 : 10],
  });
  const scale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, place === 1 ? 1.1 : 1],
  });

  const MEDAL = place === 1 ? '👑' : place === 2 ? '🥈' : '🥉';
  const borderColor =
    place === 1 ? '#FFD700' : place === 2 ? '#C0C0C0' : '#CD7F32';

  return (
    <Animated.View
      style={[
        styles.podiumCard,
        {
          backgroundColor: theme.colors.surface,
          borderColor,
          borderWidth: place === 1 ? 1.5 : 1,
          transform: [{ translateY }, { scale }],
        },
      ]}
    >
      <Text style={{ fontSize: place === 1 ? 28 : 22 }}>{MEDAL}</Text>
      <AvatarBubble avatar={data.avatar} size={place === 1 ? 46 : 36} />
      <Text
        style={{
          fontWeight: '800',
          color: place === 1 ? '#FFD700' : theme.colors.text,
          fontSize: place === 1 ? 13 : 11,
          textAlign: 'center',
        }}
        numberOfLines={1}
      >
        {data.username}
      </Text>
      <Text
        style={{
          color: theme.colors.coin,
          fontWeight: '900',
          fontSize: place === 1 ? 14 : 12,
        }}
      >
        {data.points}
      </Text>
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  standingCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  stateBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  retryBtn: {
    marginTop: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  container: { padding: 20, flex: 1 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 14 },

  // Countdown
  countdownBanner: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  countdownTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  countdownEmoji: { fontSize: 26 },
  countdownTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  countdownSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  timeUnit: { alignItems: 'center', minWidth: 52 },
  timeValue: {
    fontSize: 34,
    fontWeight: '900',
    color: '#fff',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  timeValueUrgent: { color: '#FCD34D' },
  timeLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
  },
  colon: {
    fontSize: 30,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 14,
    paddingHorizontal: 2,
  },

  // Tabs
  tabs: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  tab: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20 },

  // Podium
  podium: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  podiumCard: {
    width: '30%',
    alignItems: 'center',
    padding: 14,
    borderRadius: 18,
    gap: 6,
  },

  // Avatar fallback
  avatarFallback: {
    backgroundColor: '#1E1B4B',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Jump
  jumpFloating: {
    position: 'absolute',
    bottom: 110,
    alignSelf: 'center',
    backgroundColor: '#5B7CFF',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
    zIndex: 20,
  },
  jumpText: { color: '#fff', fontWeight: '700' },

  // Row
  row: {
    padding: 14,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
});
