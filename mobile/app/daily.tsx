import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
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
import { LINKS } from '@/src/constants/links';
import { useTheme } from '@/src/theme/useTheme';
import { dailyNumber, localDateKey, resultGrid } from '@/src/utils/share';

type DailyView = {
  date: string;
  number: number;
  totalQuestions: number;
  played: boolean;
  finished: boolean;
  result: { correct: number; total: number; results: boolean[] } | null;
  myRank: number | null;
  players: number;
  top: {
    rank: number;
    userId: string;
    username: string;
    avatar: string;
    correct: number;
    total: number;
    isMe: boolean;
  }[];
};

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
      <ScrollView
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
                {data.top.map((p) => (
                  <PlayerRow
                    key={p.userId}
                    rank={p.rank}
                    username={p.username}
                    avatar={p.avatar}
                    score={`${p.correct}/${p.total}`}
                    isMe={p.isMe}
                  />
                ))}
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
});
