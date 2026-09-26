import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, errorMessage } from '@/src/api/api';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { PlayerRow } from '@/src/components/PlayerRow';
import { useTheme } from '@/src/theme/useTheme';
import { LEAGUE_STYLE } from '@/src/constants/leagues';

type League = {
  week: string;
  endsAt: string;
  tier: number;
  tierName: string;
  tiers: string[];
  joined: boolean;
  myXp: number;
  promoteCount: number;
  demoteCount: number;
  rewards: number[];
  members: { rank: number; userId: string; username: string; avatar: string; xp: number; isMe: boolean }[];
  lastResult: {
    week: string;
    tierName: string;
    rank: number;
    outcome: 'promoted' | 'demoted' | 'stayed';
    reward: number;
  } | null;
};

function timeLeft(endsAt: string) {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return 'ending now';
  const h = Math.floor(ms / 3_600_000);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h left` : `${h}h ${Math.floor((ms % 3_600_000) / 60_000)}m left`;
}

export default function LeagueScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [data, setData] = useState<League | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res: any = await api.get('/leagues/current');
      setData(res.data);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, "Couldn't load your league."));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const style = data ? LEAGUE_STYLE[data.tier] ?? LEAGUE_STYLE[0] : LEAGUE_STYLE[0];
  const n = data?.members.length ?? 0;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScreenHeader title="League" />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}
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
        {!data && !error && <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 40 }} />}
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
            <View style={[styles.hero, { backgroundColor: style.color }]}>
              <Text style={{ fontSize: 44 }}>{style.icon}</Text>
              <Text style={styles.heroTitle}>{data.tierName} League</Text>
              <Text style={styles.heroSub}>{timeLeft(data.endsAt)} · resets Monday 00:00 UTC</Text>
              <View style={styles.tierRow} accessibilityLabel={`Tier ${data.tier + 1} of ${data.tiers.length}`}>
                {data.tiers.map((t, i) => (
                  <View
                    key={t}
                    style={[styles.tierDot, { backgroundColor: i <= data.tier ? '#fff' : '#ffffff40' }]}
                  />
                ))}
              </View>
            </View>

            {data.lastResult && (
              <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                <Text style={{ color: theme.colors.text, fontWeight: '800' }}>
                  {data.lastResult.outcome === 'promoted'
                    ? `🎉 Promoted! You finished #${data.lastResult.rank} in ${data.lastResult.tierName}.`
                    : data.lastResult.outcome === 'demoted'
                      ? `You finished #${data.lastResult.rank} in ${data.lastResult.tierName} and dropped a league. Climb back this week!`
                      : `You finished #${data.lastResult.rank} in ${data.lastResult.tierName} and held your place.`}
                </Text>
                {data.lastResult.reward > 0 && (
                  <Text style={{ color: theme.colors.coin, marginTop: 4, fontWeight: '700' }}>
                    +{data.lastResult.reward} coins for the podium
                  </Text>
                )}
              </View>
            )}

            <View style={[styles.card, { backgroundColor: theme.colors.surface, gap: 4 }]}>
              <Text style={{ color: theme.colors.text, fontWeight: '800' }}>How it works</Text>
              <Text style={{ color: theme.colors.muted, fontSize: 13 }}>
                Every correct answer earns XP, in any mode. The top of your group moves up a league each
                week{data.tier > 0 ? ', the bottom moves down' : ''}. Top 3 win {data.rewards.join(' / ')} coins.
              </Text>
            </View>

            {!data.joined ? (
              <View style={[styles.card, { backgroundColor: theme.colors.surface, alignItems: 'center', gap: 10 }]}>
                <Text style={{ color: theme.colors.text, fontWeight: '800', textAlign: 'center' }}>
                  Answer a question correctly this week to join a {data.tierName} group.
                </Text>
                <TouchableOpacity
                  onPress={() => router.push('/quiz/mode')}
                  style={[styles.btn, { backgroundColor: theme.colors.primary }]}
                  accessibilityRole="button"
                  hitSlop={8}
                >
                  <Text style={{ color: '#fff', fontWeight: '900' }}>Play now</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {data.members.map((m) => {
                  const zone =
                    m.rank <= data.promoteCount
                      ? 'up'
                      : data.demoteCount > 0 && m.rank > n - data.demoteCount
                        ? 'down'
                        : null;
                  return (
                    <View key={m.userId}>
                      <PlayerRow
                        rank={m.rank}
                        username={m.username}
                        avatar={m.avatar}
                        score={`${m.xp} XP`}
                        isMe={m.isMe}
                        zone={zone}
                      />
                      {m.rank === data.promoteCount && n > data.promoteCount && (
                        <Text style={[styles.zoneLabel, { color: theme.colors.success }]}>▲ Promotion zone</Text>
                      )}
                      {data.demoteCount > 0 && m.rank === n - data.demoteCount && (
                        <Text style={[styles.zoneLabel, { color: theme.colors.danger }]}>▼ Relegation zone</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16 },
  hero: { borderRadius: 22, padding: 20, alignItems: 'center', gap: 4 },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '900' },
  heroSub: { color: '#ffffffd9', fontSize: 13 },
  tierRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  tierDot: { width: 18, height: 6, borderRadius: 3 },
  btn: { borderRadius: 14, paddingVertical: 12, paddingHorizontal: 24 },
  zoneLabel: { fontSize: 11, fontWeight: '800', textAlign: 'center', marginTop: 6 },
});
