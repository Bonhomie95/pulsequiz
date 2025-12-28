import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QUESTIONS } from '@/src/constants/questions';
import { useCoinStore } from '@/src/store/useCoinStore';
import { useTheme } from '@/src/theme/useTheme';

const TIME_PER_QUESTION = 15;
const HINT_COSTS = [10, 20, 50];

export default function QuizScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { category } = useLocalSearchParams<{ category?: string }>();

  const { coins, spendCoins } = useCoinStore();

  /* ---------------- CATEGORY ---------------- */

  const activeCategory = category ?? 'general';

  const categoryQuestions = useMemo(() => {
    return QUESTIONS.filter((q) => q.category === activeCategory).slice(0, 10);
  }, [activeCategory]);

  /* ---------------- STATE ---------------- */

  const [index, setIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIME_PER_QUESTION);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<
    { questionId: string; selected: number | null }[]
  >([]);

  const [hintsUsed, setHintsUsed] = useState(0);
  const [disabledOptions, setDisabledOptions] = useState<number[]>([]);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const current = categoryQuestions[index];

  /* ---------------- SAFETY ---------------- */

  // If category has no questions
  useEffect(() => {
    if (!current) {
      router.replace('/home');
    }
  }, [current]);

  /* ---------------- TIMER ---------------- */

  useEffect(() => {
    if (!current) return;

    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t === 1) {
          clearInterval(timerRef.current!);
          submitAnswer(null); // timeout
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current!);
  }, [index, current]);

  /* ---------------- ANSWER SUBMIT ---------------- */

  const submitAnswer = (option: number | null) => {
    if (selected !== null || !current) return;

    clearInterval(timerRef.current!);
    setSelected(option);

    const isCorrect = option === current.answer;

    if (option === null || !isCorrect) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const updatedAnswers = [
      ...answers,
      { questionId: current.id, selected: option },
    ];

    setAnswers(updatedAnswers);

    setTimeout(() => {
      const isLast = index === categoryQuestions.length - 1;

      if (isLast) {
        router.replace({
          pathname: '/quiz/result',
          params: {
            answers: JSON.stringify(updatedAnswers),
          },
        });
      } else {
        setIndex((i) => i + 1);
        setTimeLeft(TIME_PER_QUESTION);
        setSelected(null);
        setDisabledOptions([]);
      }
    }, 900);
  };

  /* ---------------- HINT LOGIC ---------------- */

  const getHintCost = () => HINT_COSTS[hintsUsed];

  const useHint = () => {
    if (!current || selected !== null || hintsUsed >= 3) return;

    const cost = getHintCost();
    const ok = spendCoins(cost);

    if (!ok) {
      alert('Not enough coins');
      return;
    }

    const wrongIndexes = current.options
      .map((_, i) => i)
      .filter((i) => i !== current.answer && !disabledOptions.includes(i));

    if (wrongIndexes.length === 0) return;

    const remove =
      wrongIndexes[Math.floor(Math.random() * wrongIndexes.length)];

    setDisabledOptions((prev) => [...prev, remove]);
    setHintsUsed((h) => h + 1);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  /* ---------------- UI ---------------- */

  if (!current) return null;

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <View style={{ flex: 1, padding: 20 }}>
        {/* TOP BAR */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: theme.colors.muted }}>
            {index + 1} / {categoryQuestions.length}
          </Text>

          <Text
            style={{
              color: timeLeft <= 5 ? theme.colors.danger : theme.colors.primary,
              fontWeight: '700',
            }}
          >
            {timeLeft}s
          </Text>
        </View>

        {/* QUESTION */}
        <View
          style={{
            marginTop: 32,
            padding: 24,
            borderRadius: 20,
            backgroundColor: theme.colors.surface,
          }}
        >
          <Text
            style={{
              color: theme.colors.text,
              fontSize: 20,
              fontWeight: '600',
              textAlign: 'center',
            }}
          >
            {current.question}
          </Text>
        </View>

        {/* HINT */}
        <TouchableOpacity
          onPress={useHint}
          disabled={hintsUsed >= 3}
          style={{ marginTop: 12, opacity: hintsUsed >= 3 ? 0.4 : 1 }}
        >
          <Text style={{ color: theme.colors.primary }}>
            Hint ({hintsUsed < 3 ? getHintCost() : 'Max'}) • 💰 {coins}
          </Text>
        </TouchableOpacity>

        {/* ANSWERS */}
        <View style={{ marginTop: 32, gap: 16 }}>
          {current.options.map((opt, i) => {
            let bg = theme.colors.surface;

            if (selected !== null) {
              if (i === current.answer) bg = theme.colors.success;
              else if (i === selected) bg = theme.colors.danger;
            }

            const disabled = disabledOptions.includes(i);

            return (
              <TouchableOpacity
                key={i}
                disabled={selected !== null || disabled}
                onPress={() => submitAnswer(i)}
                style={{
                  padding: 18,
                  borderRadius: 16,
                  alignItems: 'center',
                  backgroundColor: bg,
                  opacity: disabled ? 0.4 : 1,
                }}
              >
                <Text
                  style={{
                    color: theme.colors.text,
                    fontSize: 16,
                  }}
                >
                  {opt}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  questionCard: {
    marginTop: 32,
    padding: 24,
    borderRadius: 20,
  },
  questionText: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  answers: {
    marginTop: 32,
    gap: 16,
  },
  answerBtn: {
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
});
