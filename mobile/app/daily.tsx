import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalendarDays, Share2 } from 'lucide-react-native';

import { api, errorMessage } from '@/src/api/api';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { PlayerRow } from '@/src/components/PlayerRow';
import { UserAvatar } from '@/src/components/UserAvatar';
import { LINKS } from '@/src/constants/links';
import { useTheme } from '@/src/theme/useTheme';
import { dailyNumber, localDateKey, resultGrid } from '@/src/utils/share';

type DailyView = {
  date: string;
  number: number;
  totalQuestions: number;
  played: boolean;
  finished: boolean;
  result: { correct: number; total: number; results: boolean[]; timeLeftMs?: number } | null;
  myRank: number | null;
  players: number;
  top: {
    rank: number;
    userId: string;
    username: string;
    avatar: string;
    correct: number;
    total: number;
    /** Unused time. Higher = faster, and the tie-break between equal scores. */
    timeLeftMs: number;
    isMe: boolean;
  }[];
};

/** 15s per question is the clock the server runs; unused time inverts to speed. */
const SECONDS_PER_QUESTION = 15;

/**
 * "1:48" — how long the run actually took.
 *
 * Both inputs are defended: a server that predates `timeLeftMs` on the board
 * sends undefined, and `total * 15 - undefined` is NaN, which rendered as
 * "NaN:NaN" on every row.
 */
function timeTaken(total: number, timeLeftMs: number | undefined | null) {
  const totalSecs = Number(total) * SECONDS_PER_QUESTION;
  const leftSecs = Number(timeLeftMs ?? 0) / 1000;
  if (!Number.isFinite(totalSecs) || !Number.isFinite(leftSecs)) return '—';
  const secs = Math.max(0, Math.round(totalSecs - leftSecs));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

/** Time until the player's local midnight, e.g. "5h 12m". */
function untilMidnight() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const mins = Math.max(0, Math.round((next.getTime() - now.getTime()) / 60000));
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function DailyScreen() {
  const theme = useTheme();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  /** Where the pinned "your position" row sits, once it has been laid out. */
  const [myRowY, setMyRowY] = useState<number | null>(null);
  const [data, setData] = useState<DailyView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const date = localDateKey();

  const load = useCallback(async () => {
    try {
      const res: any = await api.get(`/daily?date=${date}`);
      setData(res.data);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, "Couldn't load today's quiz."));
    }
  }, [date]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const share = async () => {
    if (!data?.result) return;
    try {
      await Share.share({
        message: `PulseQuiz Daily #${dailyNumber(date)}  ${data.result.correct}/${data.result.total}\n${resultGrid(data.result.results)}\n\n${LINKS.WEBSITE}`,
      });
    } catch {
      /* cancelled */
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScreenHeader title="Daily Quiz" />
      {/* Only worth offering once the board is long enough to lose yourself in. */}
      {myRowY != null && (
        <TouchableOpacity
          onPress={() =>
            scrollRef.current?.scrollTo({ y: Math.max(0, myRowY - 120), animated: true })
          }
          style={[styles.jumpBtn, { backgroundColor: theme.colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel="Scroll to my position"
          hitSlop={10}
        >
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>⬇ Jump to me</Text>
        </TouchableOpacity>
      )}

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={theme.colors.primary}
          />
        }
      >
        {!data && !error && (
          <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 40 }} />
        )}
        {error && (
          <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Text style={{ color: theme.colors.danger, fontWeight: '700' }}>{error}</Text>
            <TouchableOpacity onPress={load} accessibilityRole="button" hitSlop={8} style={{ marginTop: 8 }}>
              <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}

        {data && (
          <>
            <View style={[styles.hero, { backgroundColor: theme.colors.primary }]}>
              <CalendarDays size={28} color="#fff" />
              <Text style={styles.heroTitle}>Daily #{data.number}</Text>
              <Text style={styles.heroSub}>
                The same {data.totalQuestions} questions for everyone today. One try — no hints.
              </Text>

              {data.finished && data.result ? (
                <>
                  <Text style={styles.heroScore}>
                    {data.result.correct}/{data.result.total}
                  </Text>
                  <Text style={{ fontSize: 22, letterSpacing: 2 }}>{resultGrid(data.result.results)}</Text>
                  {data.myRank && (
                    <Text style={styles.heroSub}>
                      #{data.myRank} of {data.players} players today
                    </Text>
                  )}
                  <TouchableOpacity
                    onPress={share}
                    style={styles.heroBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Share your result"
                    hitSlop={8}
                  >
                    <Share2 size={16} color={theme.colors.primary} />
                    <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>Share</Text>
                  </TouchableOpacity>
                  <Text style={styles.heroSub}>Next quiz in {untilMidnight()}</Text>
                </>
              ) : data.played ? (
                <Text style={[styles.heroSub, { marginTop: 12 }]}>
                  You started today&apos;s quiz but didn&apos;t finish it. A new one opens in {untilMidnight()}.
                </Text>
              ) : (
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/quiz/play', params: { mode: 'daily', date } })}
                  style={styles.heroBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Play today's quiz"
                  hitSlop={8}
                >
                  <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 16 }}>
                    Play today&apos;s quiz
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={[styles.section, { color: theme.colors.text }]}>
              Today&apos;s top players {data.players > 0 ? `· ${data.players} played` : ''}
            </Text>
            {data.top.length === 0 ? (
              <Text style={{ color: theme.colors.muted }}>Nobody has finished yet — be the first.</Text>
            ) : (
              <View style={{ gap: 8 }}>
                {/* Podium, same shape as the leaderboard's top three. */}
                <View style={styles.podium}>
                  {/* Olympic order: silver, gold raised in the middle, bronze.
                      Same arrangement as the Leaderboard podium. */}
                  {([1, 0, 2] as const).map((place) => {
                    const p = data.top[place];
                    if (!p) return null;
                    const isFirst = place === 0;
                    const medalColor =
                      place === 0 ? '#FFD700' : place === 1 ? '#C0C0C0' : '#CD7F32';

                    return (
                      <View
                        key={p.userId}
                        style={[
                          styles.podiumCard,
                          {
                            backgroundColor: p.isMe
                              ? theme.colors.primary + '1F'
                              : theme.colors.surface,
                            borderColor: p.isMe ? theme.colors.primary : medalColor,
                            borderWidth: isFirst ? 1.5 : 1,
                            marginTop: isFirst ? 0 : 18,
                          },
                        ]}
                        accessible
                        accessibilityLabel={`Rank ${p.rank}, ${p.isMe ? 'you' : p.username}, ${p.correct} of ${p.total} in ${timeTaken(p.total, p.timeLeftMs)}`}
                      >
                        <Text style={{ fontSize: isFirst ? 28 : 22 }}>
                          {['👑', '🥈', '🥉'][place]}
                        </Text>
                        <UserAvatar avatar={p.avatar} size={isFirst ? 46 : 36} />
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.podiumName,
                            {
                              color: isFirst ? '#FFD700' : theme.colors.text,
                              fontSize: isFirst ? 13 : 11,
                            },
                          ]}
                        >
                          {p.isMe ? 'You' : p.username}
                        </Text>
                        <Text
                          style={[
                            styles.podiumScore,
                            { color: theme.colors.text, fontSize: isFirst ? 15 : 13 },
                          ]}
                        >
                          {p.correct}/{p.total}
                        </Text>
                        <Text style={{ color: theme.colors.muted, fontSize: 11 }}>
                          {timeTaken(p.total, p.timeLeftMs)}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                {data.top.slice(3).map((p) => (
                  <PlayerRow
                    key={p.userId}
                    rank={p.rank}
                    username={p.username}
                    avatar={p.avatar}
                    score={`${p.correct}/${p.total} · ${timeTaken(p.total, p.timeLeftMs)}`}
                    isMe={p.isMe}
                  />
                ))}

                {/* Pinned at the end when you are past the visible board, so
                    you never have to hunt for yourself. */}
                {data.myRank != null &&
                  data.result &&
                  !data.top.some((p) => p.isMe) && (
                    <View
                      style={{ gap: 6, marginTop: 6 }}
                      onLayout={(e) => setMyRowY(e.nativeEvent.layout.y)}
                    >
                      <Text style={{ color: theme.colors.muted, fontSize: 12, fontWeight: '700' }}>
                        YOUR POSITION
                      </Text>
                      <PlayerRow
                        rank={data.myRank}
                        username="You"
                        score={`${data.result.correct}/${data.result.total} · ${timeTaken(
                          data.result.total,
                          data.result.timeLeftMs ?? 0,
                        )}`}
                        isMe
                      />
                    </View>
                  )}
              </View>
            )}
            <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
              Ties are broken by speed. The daily quiz earns league XP; it doesn&apos;t count for the prize
              leaderboard.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16 },
  hero: { borderRadius: 22, padding: 20, alignItems: 'center', gap: 6 },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '900' },
  heroSub: { color: '#ffffffd9', fontSize: 13, textAlign: 'center' },
  heroScore: { color: '#fff', fontSize: 44, fontWeight: '900', marginTop: 8 },
  heroBtn: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  section: { fontSize: 15, fontWeight: '800' },
  podium: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  podiumCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 4,
  },
  jumpBtn: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    zIndex: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  podiumName: { fontSize: 13, fontWeight: '800', maxWidth: '100%' },
  podiumScore: { fontSize: 15, fontWeight: '900' },
});
