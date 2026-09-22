import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Share2 } from 'lucide-react-native';

import { api, errorMessage } from '@/src/api/api';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { UserAvatar } from '@/src/components/UserAvatar';
import { duelLink } from '@/src/constants/links';
import { useTheme } from '@/src/theme/useTheme';
import { resultGrid } from '@/src/utils/share';

type Duel = {
  code: string;
  category: string;
  totalQuestions: number;
  expired: boolean;
  creator: { userId: string; username: string };
  isCreator: boolean;
  canPlay: boolean;
  complete: boolean;
  winnerId: string | null;
  players: {
    userId: string;
    username: string;
    avatar: string;
    isMe: boolean;
    status: 'playing' | 'done';
    correct: number | null;
    total: number;
    results: boolean[];
  }[];
};

export default function DuelScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = String(raw ?? '').toUpperCase();
  const [duel, setDuel] = useState<Duel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      api
        .get(`/duels/${code}`)
        .then((r: any) => {
          setDuel(r.data);
          setError(null);
        })
        .catch((e) => setError(errorMessage(e, "Couldn't open this challenge.")));
    }, [code]),
  );

  const me = duel?.players.find((p) => p.isMe);
  const iPlayed = me?.status === 'done';

  const share = async () => {
    const score = iPlayed && me?.correct != null ? `I got ${me.correct}/${me.total}. ` : '';
    try {
      await Share.share({
        message: `${score}Can you beat me on PulseQuiz? Same ${duel?.totalQuestions ?? 10} questions.\n👉 ${duelLink(code)}\n(or enter code ${code} in the app)`,
      });
    } catch {
      /* cancelled */
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScreenHeader title="Challenge" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        {!duel && !error && <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 40 }} />}
        {error && <Text style={{ color: theme.colors.danger, fontWeight: '700' }}>{error}</Text>}

        {duel && (
          <>
            <View style={[styles.card, { backgroundColor: theme.colors.surface, alignItems: 'center' }]}>
              <Text style={{ color: theme.colors.muted, fontWeight: '700' }}>
                <Text style={{ textTransform: 'capitalize' }}>{duel.category}</Text> · {duel.totalQuestions}{' '}
                questions
              </Text>
              <Text style={[styles.code, { color: theme.colors.primary }]}>{duel.code}</Text>
              <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                {duel.isCreator ? 'Your challenge' : `From ${duel.creator.username}`}
                {duel.expired ? ' · expired' : ''}
              </Text>
            </View>

            {duel.players.length === 0 && (
              <Text style={{ color: theme.colors.muted, textAlign: 'center' }}>Nobody has played yet.</Text>
            )}
            {duel.players.map((p) => {
              const won = duel.winnerId === p.userId;
              return (
                <View
                  key={p.userId}
                  style={[
                    styles.player,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: won ? theme.colors.success : 'transparent',
                    },
                  ]}
                >
                  <UserAvatar avatar={p.avatar} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontWeight: '800' }}>
                      {p.isMe ? 'You' : p.username} {won ? '🏆' : ''}
                    </Text>
                    <Text style={{ color: theme.colors.muted, fontSize: 12, marginTop: 2 }}>
                      {p.status === 'playing'
                        ? 'Playing…'
                        : p.correct == null
                          ? 'Finished — play to see the score'
                          : resultGrid(p.results)}
                    </Text>
                  </View>
                  {p.correct != null && (
                    <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 20 }}>
                      {p.correct}/{p.total}
                    </Text>
                  )}
                </View>
              );
            })}

            {duel.complete && (
              <Text style={{ color: theme.colors.text, textAlign: 'center', fontWeight: '800' }}>
                {duel.winnerId == null
                  ? "It's a draw!"
                  : duel.players.find((p) => p.userId === duel.winnerId)?.isMe
                    ? 'You win! 🎉'
                    : 'They win this one. Rematch?'}
              </Text>
            )}

            {duel.canPlay && (
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/quiz/play', params: { mode: 'duel', duelCode: code } })}
                style={[styles.btn, { backgroundColor: theme.colors.primary }]}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>Play now</Text>
              </TouchableOpacity>
            )}

            {duel.isCreator && !duel.complete && !duel.expired && (
              <TouchableOpacity
                onPress={share}
                style={[styles.btn, styles.outline, { borderColor: theme.colors.primary }]}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Share2 size={18} color={theme.colors.primary} />
                <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>Send to a friend</Text>
              </TouchableOpacity>
            )}

            {duel.complete && (
              <TouchableOpacity
                onPress={() => router.replace('/duel')}
                style={[styles.btn, styles.outline, { borderColor: theme.colors.primary }]}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>New challenge</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 18, gap: 4 },
  code: { fontSize: 34, fontWeight: '900', letterSpacing: 6, marginVertical: 4 },
  player: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 14, borderWidth: 1.5 },
  btn: { borderRadius: 16, paddingVertical: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  outline: { borderWidth: 1.5 },
});
