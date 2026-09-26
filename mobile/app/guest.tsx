import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, errorMessage } from '@/src/api/api';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { ThemeToggle } from '@/src/components/ThemeToggle';
import { useTheme } from '@/src/theme/useTheme';
import { resultGrid } from '@/src/utils/share';

type GuestQuestion = {
  id: string;
  category: string;
  question: string;
  options: string[];
  answer: number;
  explanation: string | null;
};

/**
 * Five easy questions to try before creating an account. Nothing is scored
 * or saved — it's a taste of the game, then an invitation to sign up.
 */
export default function GuestQuiz() {
  const theme = useTheme();
  const router = useRouter();
  const [questions, setQuestions] = useState<GuestQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [results, setResults] = useState<boolean[]>([]);

  const load = () => {
    setError(null);
    api
      .get('/quiz/guest')
      .then((r: any) => setQuestions(r.data.questions ?? []))
      .catch((e) => setError(errorMessage(e, "Couldn't load questions. Check your connection.")));
  };
  useEffect(load, []);

  const q = questions?.[index];
  const done = !!questions && questions.length > 0 && index >= questions.length;

  const choose = (i: number) => {
    if (!q || picked !== null) return;
    const ok = i === q.answer;
    setPicked(i);
    setResults((r) => [...r, ok]);
    Haptics.notificationAsync(
      ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    );
  };

  const next = () => {
    setPicked(null);
    setIndex((i) => i + 1);
  };

  const signUp = () => router.replace('/(auth)/login');

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScreenHeader title="Quick Quiz" right={<ThemeToggle />} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32, flexGrow: 1 }}>
        {error && (
          <View style={{ gap: 10 }}>
            <Text style={{ color: theme.colors.danger, fontWeight: '700' }}>{error}</Text>
            <TouchableOpacity onPress={load} accessibilityRole="button" hitSlop={8}>
              <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}
        {!questions && !error && <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 40 }} />}

        {done ? (
          <View style={{ alignItems: 'center', gap: 10, marginTop: 20 }}>
            <Text style={{ fontSize: 46 }}>{results.every(Boolean) ? '🏆' : '🎯'}</Text>
            <Text style={{ color: theme.colors.text, fontSize: 26, fontWeight: '900' }}>
              {results.filter(Boolean).length}/{results.length} correct
            </Text>
            <Text style={{ fontSize: 24, letterSpacing: 2 }}>{resultGrid(results)}</Text>
            <Text style={{ color: theme.colors.muted, textAlign: 'center', marginTop: 6 }}>
              Create a free account to keep your score, join a weekly league, play the Daily Quiz and
              challenge friends.
            </Text>
            <TouchableOpacity
              onPress={signUp}
              style={[styles.btn, { backgroundColor: theme.colors.primary, alignSelf: 'stretch' }]}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>Sign up free</Text>
            </TouchableOpacity>
          </View>
        ) : (
          q && (
            <>
              <Text style={{ color: theme.colors.muted, fontWeight: '700' }}>
                <Text style={{ textTransform: 'capitalize' }}>{q.category}</Text> · {index + 1} of{' '}
                {questions!.length}
              </Text>
              <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <Text style={{ color: theme.colors.text, fontSize: 19, fontWeight: '800', lineHeight: 26 }}>
                  {q.question}
                </Text>
              </View>
              {q.options.map((opt, i) => {
                const reveal = picked !== null;
                const right = i === q.answer;
                const bg = reveal && right
                  ? theme.colors.success
                  : reveal && i === picked
                    ? theme.colors.danger
                    : theme.colors.surface;
                const fg = reveal && (right || i === picked) ? '#fff' : theme.colors.text;
                return (
                  <Pressable
                    key={i}
                    onPress={() => choose(i)}
                    disabled={reveal}
                    accessibilityRole="button"
                    accessibilityLabel={`Answer ${i + 1}: ${opt}`}
                    accessibilityState={{ disabled: reveal, selected: picked === i }}
                    style={[styles.option, { backgroundColor: bg, borderColor: theme.colors.border }]}
                  >
                    <Text style={{ color: fg, fontWeight: '700', fontSize: 15 }}>{opt}</Text>
                  </Pressable>
                );
              })}
              {picked !== null && (
                <View style={{ gap: 10 }}>
                  {q.explanation ? (
                    <Text style={{ color: theme.colors.muted, lineHeight: 20 }}>💡 {q.explanation}</Text>
                  ) : null}
                  <TouchableOpacity
                    onPress={next}
                    style={[styles.btn, { backgroundColor: theme.colors.primary }]}
                    accessibilityRole="button"
                    hitSlop={8}
                  >
                    <Text style={{ color: '#fff', fontWeight: '900' }}>
                      {index + 1 < questions!.length ? 'Next question' : 'See my score'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 18, borderWidth: 1 },
  option: { borderRadius: 18, paddingVertical: 16, paddingHorizontal: 16, borderWidth: 1, alignItems: 'center' },
  btn: { borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
});
