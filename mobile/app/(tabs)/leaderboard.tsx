import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';

import { api } from '@/src/api/api';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useTheme } from '@/src/theme/useTheme';
import { enterImmersiveMode } from '@/src/utils/immersive';
import { AVATAR_MAP } from '@/src/constants/avatars';

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

  // Tick every second
  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(getNextPayoutDate(type).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, [type]);

  // Pulse the colon separators
  useEffect(() => {
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
  }, []);

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
  const src = avatar ? AVATAR_MAP[avatar] : null;
  if (src) {
    return (
      <Image
        source={src}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
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

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        let list: Entry[] = [];
        let prizeData = null;

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
        }

        if (!mounted) return;

        setData(list);
        setPrizeInfo(prizeData);

        const idx = list.findIndex((u) => u.userId === userId);
        setMyIndex(idx >= 0 ? idx : null);

        podiumAnim.setValue(0);
        Animated.spring(podiumAnim, {
          toValue: 1,
          useNativeDriver: true,
          friction: 6,
        }).start();
        Animated.timing(jumpAnim, {
          toValue: idx != null && idx >= 3 ? 1 : 0,
          duration: 300,
          useNativeDriver: true,
        }).start();
      } catch (e) {
        console.error(e);
        setData([]);
        setMyIndex(null);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [tab]);

  useFocusEffect(
    useCallback(() => {
      enterImmersiveMode();
    }, []),
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
            <TouchableOpacity onPress={scrollToMe}>
              <Text style={styles.jumpText}>⬇ Jump to me</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* EMPTY FRIENDS */}
        {tab === 'friends' && data.length === 0 && (
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
          data={rest}
          keyExtractor={(i) => i.userId}
          contentContainerStyle={{ paddingBottom: 80 }}
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
