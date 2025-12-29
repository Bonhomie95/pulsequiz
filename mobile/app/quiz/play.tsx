import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import * as NavigationBar from 'expo-navigation-bar';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api/api';
import { AVATAR_MAP } from '@/src/constants/avatars';
import { useCoinStore } from '@/src/store/useCoinStore';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useTheme } from '@/src/theme/useTheme';

const TIME_PER_QUESTION = 15;
const HINT_COSTS = [10, 20, 50] as const;
const TOTAL_Q = 10;

type Question = {
  id: string;
  question: string;
  options: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  // we compute this from backend answer response
  correctIndex?: number;
};

type AnswerRes = {
  correct: boolean;
  finished: boolean;
  correctIndex?: number;
};

function cap(s: string) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** Simple SVG-less ring (good enough + no deps). */
function ProgressRing({
  size = 44,
  stroke = 6,
  progress,
  color,
  bg,
  text,
  textColor,
}: {
  size?: number;
  stroke?: number;
  progress: number; // 0..1
  color: string;
  bg: string;
  text: string;
  textColor: string;
}) {
  // A lightweight ring using 2 half-circles trick (no SVG).
  // It’s not mathematically perfect, but looks great for UI.
  const p = clamp(progress, 0, 1);
  const rotate = p * 360;

  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.ringBase,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: stroke,
            borderColor: bg,
          },
        ]}
      />
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          transform: [{ rotate: `${rotate}deg` }],
        }}
      >
        <View
          style={[
            styles.ringFill,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: stroke,
              borderColor: color,
              borderLeftColor: 'transparent',
              borderBottomColor: 'transparent',
            },
          ]}
        />
      </View>

      <View style={[StyleSheet.absoluteFill, styles.ringCenter]}>
        <Text style={{ color: textColor, fontWeight: '800', fontSize: 12 }}>
          {text}
        </Text>
      </View>
    </View>
  );
}

export default function QuizPlay() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const router = useRouter();
  const theme = useTheme();

  const { coins, spendCoins } = useCoinStore();
  const user = useAuthStore((s) => s.user);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);

  const [timeLeft, setTimeLeft] = useState(TIME_PER_QUESTION);
  const [loading, setLoading] = useState(true);

  // selection UI
  const [locked, setLocked] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [correctIndex, setCorrectIndex] = useState<number | null>(null);

  // hint UI
  const [hintsUsed, setHintsUsed] = useState(0);
  const [disabledOptions, setDisabledOptions] = useState<number[]>([]);

  // overlay
  const [overlay, setOverlay] = useState<null | {
    type: 'correct' | 'wrong' | 'timeout';
    message: string;
  }>(null);

  // animations
  const cardAnim = useRef(new Animated.Value(0)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  // timers & audio
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const beepRef = useRef<Audio.Sound | null>(null);
  const tickingRef = useRef(false);

  const q = questions[index];

  const avatarSource = useMemo(() => {
    // user.avatar might be "avatar2" or a url; adapt to your app.
    const a = user?.avatar;
    if (!a) return null;
    if (typeof a === 'string' && a.startsWith('avatar')) {
      const n = Number(a.replace('avatar', ''));
      const map = Object.values(AVATAR_MAP);
      return map[n] ?? null;
    }
    // if you ever use remote URL avatars, you'd render with { uri: a }
    return null;
  }, [user?.avatar]);

  const progress01 = useMemo(() => {
    const total = Math.max(questions.length || TOTAL_Q, 1);
    return (index + 1) / total;
  }, [index, questions.length]);

  const hintCost = useMemo(() => HINT_COSTS[hintsUsed] ?? 999, [hintsUsed]);

  const playBeep = useCallback(async () => {
    try {
      // Put a short beep mp3/wav in assets/sounds/beep.mp3
      // If you don't have it yet, comment this out or add the file.
      const source = require('@/assets/sounds/beep.mp3');
      if (!beepRef.current) {
        const { sound } = await Audio.Sound.createAsync(source, {
          shouldPlay: false,
          volume: 0.9,
        });
        beepRef.current = sound;
      }
      await beepRef.current.replayAsync();
    } catch {
      // no-op if beep asset missing
    }
  }, []);

  const stopBeep = useCallback(async () => {
    try {
      if (beepRef.current) {
        await beepRef.current.stopAsync();
        await beepRef.current.unloadAsync();
        beepRef.current = null;
      }
    } catch {}
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const showOverlay = useCallback(
    (type: 'correct' | 'wrong' | 'timeout', message: string) => {
      setOverlay({ type, message });
      overlayAnim.setValue(0);
      Animated.timing(overlayAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
    },
    [overlayAnim]
  );

  const hideOverlay = useCallback(() => {
    Animated.timing(overlayAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => setOverlay(null));
  }, [overlayAnim]);

  const resetPerQuestionUI = useCallback(() => {
    setSelected(null);
    setCorrectIndex(null);
    setDisabledOptions([]);
    setHintsUsed(0);
    setOverlay(null);
    tickingRef.current = false;
    setTimeLeft(TIME_PER_QUESTION);
    cardAnim.setValue(0);
    Animated.timing(cardAnim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [cardAnim]);

  /** Immersive mode while this screen is focused. */
  useFocusEffect(
    useCallback(() => {
      (async () => {
        if (Platform.OS === 'android') {
          try {
            await NavigationBar.setVisibilityAsync('hidden');
            await NavigationBar.setBehaviorAsync('overlay-swipe');
          } catch {}
        }
      })();

      return () => {
        (async () => {
          if (Platform.OS === 'android') {
            try {
              await NavigationBar.setVisibilityAsync('visible');
            } catch {}
          }
        })();
      };
    }, [])
  );

  /** Start quiz session from backend */
  useEffect(() => {
    let mounted = true;

    setLoading(true);
    api
      .post('/quiz/start', { category })
      .then((res: any) => {
        if (!mounted) return;
        setSessionId(res.data.sessionId);
        setQuestions(res.data.questions);
        setIndex(0);
        setLocked(false);
        resetPerQuestionUI();
        setLoading(false);
      })
      .catch((err) => {
        console.error('Quiz start failed', err?.response?.data || err?.message);
        router.back();
      });

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  /** Timer tick */
  useEffect(() => {
    if (!sessionId || !q) return;

    stopTimer();

    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        const next = t - 1;

        if (next <= 5 && next > 0 && !tickingRef.current) {
          tickingRef.current = true;
        }

        // vibration + beep for last 5 seconds
        if (next <= 5 && next > 0) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          playBeep();
        }

        if (next <= 0) {
          stopTimer();
          // timeout
          onTimeout();
          return 0;
        }

        return next;
      });
    }, 1000);

    return () => stopTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, sessionId, q?.id]);

  useEffect(() => {
    return () => {
      stopTimer();
      stopBeep();
    };
  }, [stopTimer, stopBeep]);

  const finishQuiz = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res: any = await api.post('/quiz/finish', { sessionId });
      router.replace({
        pathname: '/quiz/result',
        params: res.data,
      });
    } catch (e) {
      router.replace('/(tabs)/home');
    }
  }, [router, sessionId]);

  const lockAndReveal = useCallback(
    (sel: number | null, cIndex: number | null) => {
      setLocked(true);
      setSelected(sel);
      if (typeof cIndex === 'number') setCorrectIndex(cIndex);
      stopTimer();
    },
    [stopTimer]
  );

  const onTimeout = useCallback(async () => {
    if (!sessionId || locked || !q) return;

    lockAndReveal(null, null);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    showOverlay('timeout', 'Time up ⏳');

    // Tell backend (selected: null)
    try {
      const res: any = await api.post('/quiz/answer', {
        sessionId,
        questionId: q.id,
        selected: null,
      });

      const cIndex = res?.data?.correctIndex;
      if (typeof cIndex === 'number') setCorrectIndex(cIndex);

      // timeout ends game immediately (your rule)
      setTimeout(() => {
        finishQuiz();
      }, 1100);
    } catch {
      setTimeout(() => {
        finishQuiz();
      }, 1100);
    }
  }, [sessionId, locked, q, lockAndReveal, showOverlay, finishQuiz]);

  const submitAnswer = useCallback(
    async (sel: number) => {
      if (!sessionId || locked || !q) return;

      lockAndReveal(sel, null);

      try {
        const res: any = await api.post('/quiz/answer', {
          sessionId,
          questionId: q.id,
          selected: sel,
        });

        const data: AnswerRes = res.data;
        const cIndex =
          typeof data.correctIndex === 'number' ? data.correctIndex : null;

        if (cIndex !== null) setCorrectIndex(cIndex);

        if (data.correct) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          showOverlay('correct', 'Correct ✅');

          // proceed to next question
          setTimeout(() => {
            hideOverlay();

            const last = index >= questions.length - 1;
            if (data.finished || last) {
              finishQuiz();
              return;
            }

            setLocked(false);
            setIndex((i) => i + 1);
            resetPerQuestionUI();
          }, 700);

          return;
        }

        // WRONG → end game immediately
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        showOverlay('wrong', 'Wrong ❌');

        setTimeout(() => {
          finishQuiz();
        }, 1100);
      } catch (e) {
        // unlock if request failed
        setLocked(false);
        setSelected(null);
      }
    },
    [
      sessionId,
      locked,
      q,
      lockAndReveal,
      index,
      questions.length,
      resetPerQuestionUI,
      finishQuiz,
      showOverlay,
      hideOverlay,
    ]
  );

  const useHint = useCallback(() => {
    if (!q || locked) return;
    if (hintsUsed >= 3) return;

    const cost = hintCost;
    if (!spendCoins(cost)) return;

    // remove one wrong option that is not the correct index
    const c = correctIndex ?? -1; // if backend hasn't given, we still can do frontend hint safely (won't remove correct if unknown? we'd rather not)
    // If we don't know correctIndex yet, hint could accidentally remove the correct one.
    // So we only allow hints when correctIndex is known OR when we can infer it.
    // We *can't* infer it without backend, so block until we know correctIndex.
    if (c < 0) {
      // refund (since spendCoins already happened)
      // if your store doesn't support refund, just block earlier instead:
      // return; (better is to block before spending)
      return;
    }

    const candidates = q.options
      .map((_, i) => i)
      .filter((i) => i !== c && !disabledOptions.includes(i));

    if (!candidates.length) return;

    const remove = candidates[Math.floor(Math.random() * candidates.length)];
    setDisabledOptions((p) => [...p, remove]);
    setHintsUsed((h) => h + 1);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [q, locked, hintsUsed, hintCost, spendCoins, disabledOptions, correctIndex]);

  // when we load a new question, animate it in
  useEffect(() => {
    if (!q) return;
    resetPerQuestionUI();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q?.id]);

  const difficultyBadge = useMemo(() => {
    const d = q?.difficulty ?? 'easy';
    const text = cap(d);
    const bg =
      d === 'hard'
        ? theme.colors.danger
        : d === 'medium'
        ? theme.colors.primary
        : theme.colors.success;

    return { text, bg };
  }, [q?.difficulty, theme.colors]);

  const canHint = useMemo(() => {
    if (!q) return false;
    if (locked) return false;
    if (hintsUsed >= 3) return false;
    if (correctIndex === null) return false; // safe rule (see above)
    return true;
  }, [q, locked, hintsUsed, correctIndex]);

  if (loading) {
    return (
      <SafeAreaView
        edges={['top', 'bottom']}
        style={[styles.safe, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={{ marginTop: 12, color: theme.colors.muted }}>
            Preparing quiz…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!q) {
    return (
      <SafeAreaView
        edges={['top', 'bottom']}
        style={[styles.safe, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.center}>
          <Text style={{ color: theme.colors.text, fontWeight: '700' }}>
            No questions found
          </Text>
          <TouchableOpacity
            onPress={() => router.replace('/(tabs)/home')}
            style={[
              styles.primaryBtn,
              { backgroundColor: theme.colors.primary, marginTop: 14 },
            ]}
          >
            <Text style={{ color: '#fff', fontWeight: '800' }}>Go Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const total = questions.length || TOTAL_Q;

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.safe, { backgroundColor: theme.colors.background }]}
    >
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {/* TOP BAR */}
        <View style={styles.topBar}>
          <View style={styles.topLeft}>
            <View
              style={[
                styles.categoryPill,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
              ]}
            >
              <Text style={{ color: theme.colors.text, fontWeight: '800' }}>
                {cap(category)}
              </Text>
            </View>

            <View
              style={[
                styles.diffPill,
                { backgroundColor: difficultyBadge.bg },
              ]}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>
                {difficultyBadge.text}
              </Text>
            </View>
          </View>

          <View style={styles.topRight}>
            <ProgressRing
              progress={progress01}
              color={theme.colors.primary}
              bg={theme.colors.border}
              text={`${index + 1}/${total}`}
              textColor={theme.colors.text}
            />

            <View style={styles.avatarWrap}>
              {avatarSource ? (
                <Image source={avatarSource} style={styles.avatarImg} />
              ) : (
                <View
                  style={[
                    styles.avatarFallback,
                    { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                  ]}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                    {(user?.username?.[0] ?? 'P').toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* TIMER + META */}
        <View style={styles.metaRow}>
          <Text style={{ color: theme.colors.muted, fontWeight: '700' }}>
            Question {index + 1} of {total}
          </Text>

          <View
            style={[
              styles.timerPill,
              {
                backgroundColor: theme.colors.surface,
                borderColor: timeLeft <= 5 ? theme.colors.danger : theme.colors.border,
              },
            ]}
          >
            <Text
              style={{
                color: timeLeft <= 5 ? theme.colors.danger : theme.colors.primary,
                fontWeight: '900',
                fontSize: 14,
              }}
            >
              {timeLeft}s
            </Text>
          </View>
        </View>

        {/* QUESTION CARD */}
        <Animated.View
          style={[
            styles.questionCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              opacity: cardAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.2, 1],
              }),
              transform: [
                {
                  translateY: cardAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [14, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Text
            style={[
              styles.questionText,
              { color: theme.colors.text },
            ]}
          >
            {q.question}
          </Text>
        </Animated.View>

        {/* OPTIONS */}
        <View style={{ marginTop: 18, gap: 14 }}>
          {q.options.map((opt, i) => {
            const isDisabled = disabledOptions.includes(i);

            const hasResult = selected !== null || overlay?.type === 'timeout';
            const isCorrect = correctIndex !== null ? i === correctIndex : false;
            const isSelected = selected !== null ? i === selected : false;

            let bg = theme.colors.surface;
            let border = theme.colors.border;
            let txt = theme.colors.text;

            if (hasResult) {
              if (isCorrect) {
                bg = theme.colors.success;
                border = theme.colors.success;
                txt = '#fff';
              } else if (isSelected && !isCorrect) {
                bg = theme.colors.danger;
                border = theme.colors.danger;
                txt = '#fff';
              } else {
                bg = theme.colors.surface;
                border = theme.colors.border;
                txt = theme.colors.text;
              }
            }

            return (
              <Pressable
                key={i}
                onPress={() => {
                  if (locked || isDisabled || selected !== null) return;
                  submitAnswer(i);
                }}
                style={({ pressed }) => [
                  styles.optionCard,
                  {
                    backgroundColor: bg,
                    borderColor: border,
                    opacity: isDisabled ? 0.35 : locked ? 0.65 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  },
                ]}
              >
                <Text style={{ color: txt, fontWeight: '700', fontSize: 15 }}>
                  {opt}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* FOOTER */}
        <View style={styles.footer}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity
              disabled={!canHint}
              onPress={useHint}
              style={[
                styles.hintBtn,
                {
                  backgroundColor: canHint ? theme.colors.primary : theme.colors.surface,
                  borderColor: theme.colors.border,
                  opacity: canHint ? 1 : 0.55,
                },
              ]}
            >
              <Text style={{ color: canHint ? '#fff' : theme.colors.muted, fontWeight: '900' }}>
                Hint
              </Text>
              <Text style={{ color: canHint ? '#fff' : theme.colors.muted, fontWeight: '700', fontSize: 12 }}>
                {hintsUsed < 3 ? `${hintCost} coins` : 'Max'}
              </Text>
            </TouchableOpacity>

            <View
              style={[
                styles.coinsPill,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
              ]}
            >
              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                💰 {coins}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={() => router.back()}
            style={[
              styles.exitBtn,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
          >
            <Text style={{ color: theme.colors.muted, fontWeight: '900' }}>Exit</Text>
          </TouchableOpacity>
        </View>

        {/* OVERLAY FEEDBACK */}
        {overlay && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.overlay,
              {
                opacity: overlayAnim,
                transform: [
                  {
                    translateY: overlayAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [16, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View
              style={[
                styles.overlayCard,
                {
                  backgroundColor:
                    overlay.type === 'correct'
                      ? theme.colors.success
                      : theme.colors.danger,
                },
              ]}
            >
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>
                {overlay.message}
              </Text>
              <Text style={{ color: '#fff', opacity: 0.9, marginTop: 2, fontWeight: '700' }}>
                {overlay.type === 'correct'
                  ? 'Keep going!'
                  : overlay.type === 'timeout'
                  ? 'Be faster next time.'
                  : 'Game over.'}
              </Text>
            </View>
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 14,
  },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  diffPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },

  avatarWrap: { width: 44, height: 44 },
  avatarImg: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  metaRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timerPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 70,
    alignItems: 'center',
  },

  questionCard: {
    marginTop: 16,
    padding: 22,
    borderRadius: 24,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  questionText: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 30,
    letterSpacing: -0.2,
  },

  optionCard: {
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    alignItems: 'center',
  },

  footer: {
    marginTop: 'auto',
    paddingTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  hintBtn: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
  },
  coinsPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  exitBtn: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
  },

  overlay: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 110,
    alignItems: 'center',
  },
  overlayCard: {
    width: '100%',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },

  ringBase: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  ringFill: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  ringCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  primaryBtn: {
    height: 52,
    borderRadius: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
