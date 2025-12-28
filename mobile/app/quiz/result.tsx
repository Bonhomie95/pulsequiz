import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useProgressStore } from '@/src/store/useProgressStore';
import { QUESTIONS } from '../../src/constants/questions';
import { useTheme } from '../../src/theme/useTheme';
import { getLevelFromPoints } from '../../src/utils/level';

export default function QuizResult() {
  const theme = useTheme();
  const { answers } = useLocalSearchParams();
  const { points, level, addPoints } = useProgressStore();

  const [leveledUp, setLeveledUp] = useState(false);

  /* ---------------- PARSE ANSWERS SAFELY ---------------- */

  const parsedAnswers = useMemo(() => {
    try {
      return JSON.parse(answers as string) as {
        questionId: string;
        selected: number | null;
      }[];
    } catch {
      return [];
    }
  }, [answers]);

  /* ---------------- SCORE CALCULATION ---------------- */

  const reviewed = useMemo(() => {
    let score = 0;

    const mapped = QUESTIONS.map((q) => {
      const user = parsedAnswers.find((a) => a.questionId === q.id);
      const correct = user?.selected === q.answer;

      if (correct) score++;

      return {
        ...q,
        userAnswer: user?.selected ?? null,
        correct,
      };
    });

    return { mapped, score };
  }, [parsedAnswers]);

  const bonus = reviewed.score === QUESTIONS.length ? 10 : 0;
  const total = reviewed.score + bonus;

  const nextLevel = getLevelFromPoints(points + total);

  /* ---------------- APPLY PROGRESS ONCE ---------------- */

  useEffect(() => {
    if (total <= 0) return;

    if (nextLevel > level) {
      setLeveledUp(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    addPoints(total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- UI ---------------- */

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Quiz Over
        </Text>

        <Text style={{ color: theme.colors.muted }}>
          Score: {reviewed.score} / {QUESTIONS.length}
        </Text>

        {bonus > 0 && (
          <Text style={{ color: theme.colors.success, marginTop: 8 }}>
            🎉 Perfect Score! +{bonus} Bonus
          </Text>
        )}

        <Text style={{ color: theme.colors.coin, marginTop: 8 }}>
          Total Points Earned: {total}
        </Text>

        {leveledUp && (
          <View
            style={[styles.levelUp, { backgroundColor: theme.colors.primary }]}
          >
            <Text style={styles.levelUpText}>
              🎉 Level Up! You are now Level {nextLevel}
            </Text>
          </View>
        )}

        {/* ANSWER REVIEW */}
        {reviewed.mapped.map((q, i) => (
          <View
            key={q.id}
            style={[styles.review, { backgroundColor: theme.colors.surface }]}
          >
            <Text style={{ color: theme.colors.text, fontWeight: '600' }}>
              {i + 1}. {q.question}
            </Text>

            <Text
              style={{
                marginTop: 6,
                color: q.correct ? theme.colors.success : theme.colors.danger,
              }}
            >
              Your answer:{' '}
              {q.userAnswer !== null ? q.options[q.userAnswer] : 'No answer'}
            </Text>

            {!q.correct && (
              <Text style={{ color: theme.colors.success }}>
                Correct: {q.options[q.answer]}
              </Text>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 12,
  },
  review: {
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
  },
  levelUp: {
    marginTop: 16,
    padding: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  levelUpText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
