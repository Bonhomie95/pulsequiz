import * as Haptics from 'expo-haptics';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, errorMessage } from '@/src/api/api';
import { UserAvatar } from '@/src/components/UserAvatar';
import { useCoinStore } from '@/src/store/useCoinStore';
import { rewardedAdsAvailable } from '@/src/ads/admob';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useTheme } from '@/src/theme/useTheme';
import { soundManager } from '@/src/audio/SoundManager';
import { enterImmersiveMode, exitImmersiveMode } from '@/src/utils/immersive';
import { useAppStateStore } from '@/src/store/useAppStateStore';
import { ReportQuestionButton } from '@/src/components/ReportQuestionSheet';
import { logger } from '@/src/utils/logger';
import { deadlineFrom, serverNow } from '@/src/utils/serverClock';

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
  explanation?: string | null;
  deadlineAt?: string;
};

type Mode = 'classic' | 'relaxed' | 'daily' | 'duel';

/** Router params are strings; the result screen rebuilds the grid from "1011…". */
function resultParams(data: any) {
  const { results, ...rest } = data ?? {};
  return {
    ...rest,
    results: Array.isArray(results) ? results.map((r: boolean) => (r ? '1' : '0')).join('') : '',
  };
}

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
  const params = useLocalSearchParams<{
    category?: string;
    tournamentId?: string;
    mode?: string;
    date?: string;
    duelCode?: string;
  }>();
  const { tournamentId, date, duelCode } = params;
  const mode: Mode =
    params.mode === 'relaxed' || params.mode === 'daily' || params.mode === 'duel'
      ? params.mode
      : 'classic';
  // Classic is sudden death; the rest play every question.
  const suddenDeath = mode === 'classic';
  // Shared-question modes are compared player to player — no bought help.
  const paidHelp = mode === 'classic' || mode === 'relaxed';
  const [category, setCategory] = useState(params.category ?? '');
  const router = useRouter();
  const theme = useTheme();
  const [hintUsedThisQuestion, setHintUsedThisQuestion] = useState(false);
  const [timeExtendedThisQuestion, setTimeExtendedThisQuestion] =
    useState(false);

  const { coins } = useCoinStore();
  const user = useAuthStore((s) => s.user);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIME_PER_QUESTION);
  /**
   * Server wall-clock deadline for the current question.
   *
   * The countdown used to be a bare setInterval decrementing from 15. React
   * Native suspends JS timers while the app is backgrounded, but the server's
   * deadline is absolute — so minimising for twenty seconds left the on-screen
   * clock frozen at, say, 9s while the real window had already closed. Tapping
   * then produced "answer too late" and ended the run with no explanation.
   * Deriving the display from this instead means the clock is always the truth,
   * whatever the app has been doing.
   */
  const deadlineRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);

  // selection UI
  const [locked, setLocked] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [correctIndex, setCorrectIndex] = useState<number | null>(null);

  // After-answer explanation, and what its button does.
  const [reveal, setReveal] = useState<null | {
    verdict: 'correct' | 'wrong' | 'timeout';
    explanation: string | null;
    action: 'next' | 'finish' | null;
  }>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextDeadlineRef = useRef<number | null>(null);
  const resultRef = useRef<Promise<any> | null>(null);

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

  // timers
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickingRef = useRef(false);

  const q = questions[index];

  // Boot SoundManager once for this screen lifecycle
  // useEffect(() => {
  //   soundManager.boot();
  //   return () => {
  //     // stop any playing sound as we leave this screen
  //     soundManager.stop();
  //   };
  // }, []);

  const progress01 = useMemo(() => {
    const total = Math.max(questions.length || TOTAL_Q, 1);
    return (index + 1) / total;
  }, [index, questions.length]);

  const hintCost = useMemo(() => HINT_COSTS[hintsUsed] ?? 999, [hintsUsed]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const handleExtendTime = useCallback(async () => {
    if (!sessionId || !q || locked) return;

    try {
      const res: any = await api.post('/quiz/extend-time', {
        sessionId,
        questionId: q.id,
      });

      // 🧠 ONLY go to ads if backend explicitly says so
      if (res.data?.requiresAd) {
        if (!rewardedAdsAvailable) {
          Alert.alert('Not enough coins', 'You need 20 coins for extra time.');
          return;
        }
        stopTimer(); // pause time
        router.push({
          pathname: '/earn/ads',
          params: {
            source: 'time',
            sessionId,
            questionId: q.id,
          },
        });
        return;
      }

      // ✅ SUCCESS: stay on same question
      if (res.data?.addedSeconds === 10) {
        if (typeof res.data.remainingSeconds === 'number') {
          setTimeLeft(res.data.remainingSeconds);
        }

        if (typeof res.data.coins === 'number') {
          useCoinStore.getState().setCoins(res.data.coins);
        }

        setTimeExtendedThisQuestion(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch (e) {
      logger.warn('Extend time failed', { error: String(e) });
    }
  }, [sessionId, q, locked]);

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
    [overlayAnim],
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
    setReveal(null);
    setDisabledOptions([]);
    setOverlay(null);
    setTimeExtendedThisQuestion(false);

    setHintUsedThisQuestion(false);

    tickingRef.current = false;
    setTimeLeft(TIME_PER_QUESTION);

    cardAnim.setValue(0);
    Animated.timing(cardAnim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [cardAnim]);

  useFocusEffect(
    useCallback(() => {
      enterImmersiveMode();
      return () => exitImmersiveMode();
    }, []),
  );

  /** Start quiz session from backend */
  useEffect(() => {
    let mounted = true;

    setLoading(true);
    const body =
      mode === 'daily'
        ? { mode, date }
        : mode === 'duel'
          ? { mode, duelCode }
          : { mode, category: params.category, ...(tournamentId ? { tournamentId } : {}) };
    api
      .post('/quiz/start', body)
      .then((res: any) => {
        if (!mounted) return;
        setSessionId(res.data.sessionId);
        if (res.data.category) setCategory(res.data.category);
        setQuestions(res.data.questions);
        deadlineRef.current = deadlineFrom(res.data.deadlineAt, TIME_PER_QUESTION * 1000);
        setIndex(0);
        setLocked(false);
        resetPerQuestionUI();
        setLoading(false);
        setHintsUsed(0);
      })
      .catch((err) => {
        logger.warn('Quiz start failed', { error: String(err), mode });
        Alert.alert("Couldn't start the quiz", errorMessage(err, 'Please try again.'), [
          { text: 'OK', onPress: () => router.back() },
        ]);
      });

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.category, mode, date, duelCode]);

  /** Timer tick */
  useEffect(() => {
    if (!sessionId || !q) return;

    stopTimer();

    // Derived from the server deadline rather than counted down locally, so a
    // suspended JS timer (backgrounded app, locked screen, incoming call) can
    // never leave the display disagreeing with the server.
    const tick = () => {
      const deadline = deadlineRef.current;
      if (deadline == null) return;

      // Clamped: in unranked modes the next clock can start a moment after the
      // question appears (the reveal pause), and should read 15, not 19.
      const remaining = Math.min(
        TIME_PER_QUESTION,
        Math.max(0, Math.ceil((deadline - serverNow()) / 1000)),
      );

      setTimeLeft((prev) => {
        // Only cue on a genuine second boundary, and never for seconds that
        // elapsed while the app was away — otherwise returning from the
        // background fires a burst of beeps for time already gone.
        if (remaining < prev && remaining <= 5 && remaining > 0) {
          tickingRef.current = true;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          soundManager.play('countdown');
        }
        return remaining;
      });

      if (remaining <= 0) {
        stopTimer();
        onTimeout();
      }
    };

    tick(); // paint the true remaining time immediately, before the first tick
    timerRef.current = setInterval(tick, 250);

    return () => stopTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, sessionId, q?.id]);

  useEffect(() => {
    return () => {
      stopTimer();
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, [stopTimer]);



  /**
   * Bank the result. Started the moment a run ends — before any explanation
   * is shown — so a player who closes the app on the explanation still keeps
   * their score. /quiz/finish is idempotent, so a retry can't score twice.
   */
  const collectResult = useCallback(() => {
    if (!sessionId) return null;
    if (!resultRef.current) {
      resultRef.current = api
        .post('/quiz/finish', { sessionId }, { retry: true } as any)
        .then((r: any) => r.data);
    }
    return resultRef.current;
  }, [sessionId]);

  const finishQuiz = useCallback(async () => {
    const pending = collectResult();
    if (!pending) return;

    // Dumping the player on the home screen because the network blipped at
    // the exact moment their run ended would lose the whole result.
    try {
      const data = await pending;
      // The daily pays coins on finish; without this the header still shows
      // the pre-quiz balance until something else refetches it.
      if (typeof data?.dailyCoins === 'number' && data.dailyCoins > 0) {
        useCoinStore.getState().addCoins(data.dailyCoins);
      }
      router.replace({ pathname: '/quiz/result', params: resultParams(data) });
      return;
    } catch (e) {
      resultRef.current = null;
      logger.error('Finish quiz failed', e, { sessionId });
    }

    Alert.alert(
      'Your score is saved',
      "We couldn't load your results screen just now. Your points have been recorded — check your profile in a moment.",
      [{ text: 'OK', onPress: () => router.replace('/(tabs)/home') }],
    );
  }, [router, sessionId, collectResult]);

  const lockAndReveal = useCallback(
    (sel: number | null, cIndex: number | null) => {
      setLocked(true);
      setSelected(sel);
      if (typeof cIndex === 'number') setCorrectIndex(cIndex);
      stopTimer();
    },
    [stopTimer],
  );

  useEffect(() => {
    useAppStateStore.getState().setPlayingQuiz(true);
    return () => {
      useAppStateStore.getState().setPlayingQuiz(false);
    };
  }, []);

  const advance = useCallback(() => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = null;
    hideOverlay();
    deadlineRef.current = deadlineFrom(nextDeadlineRef.current, TIME_PER_QUESTION * 1000);
    setLocked(false);
    setIndex((i) => i + 1);
    resetPerQuestionUI();
  }, [hideOverlay, resetPerQuestionUI]);

  /** One place that reacts to the server's verdict, for taps and timeouts. */
  const handleResult = useCallback(
    (data: AnswerRes, sel: number | null) => {
      const cIndex = typeof data.correctIndex === 'number' ? data.correctIndex : null;
      if (cIndex !== null) setCorrectIndex(cIndex);
      const explanation = data.explanation ?? null;
      const verdict = data.correct ? 'correct' : sel === null ? 'timeout' : 'wrong';

      if (data.correct) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        soundManager.play('victory');
      } else if (sel !== null) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        soundManager.play('fail');
      }
      // The explanation card carries the verdict itself; the toast would cover it.
      if (explanation) hideOverlay();
      else if (verdict !== 'timeout') {
        showOverlay(verdict, verdict === 'correct' ? 'Correct ✅' : 'Wrong ❌');
      }

      if (data.finished) {
        collectResult(); // bank it now, whatever the player does next
        if (explanation) {
          setReveal({ verdict, explanation, action: 'finish' });
        } else {
          setTimeout(() => finishQuiz(), data.correct ? 700 : 1100);
        }
        return;
      }

      nextDeadlineRef.current = data.deadlineAt ? new Date(data.deadlineAt).getTime() : null;

      if (suddenDeath) {
        // The 700ms reveal pause is part of the server's window, so the
        // deadline is not re-based here — only adopted.
        setTimeout(advance, 700);
        return;
      }

      // Unranked: the server paused the next clock for the reveal. Show the
      // explanation for that pause.
      //
      // Sudden death returned above, so only relaxed, daily and duel reach
      // here — every one of them can move on early. Daily used to sit on
      // "Next question in a moment…" with no way out, which reads as a frozen
      // screen once you have finished reading.
      if (explanation || !data.correct) {
        setReveal({ verdict, explanation, action: 'next' });
      }
      const wait = nextDeadlineRef.current
        ? Math.max(700, nextDeadlineRef.current - TIME_PER_QUESTION * 1000 - serverNow())
        : 700;
      advanceTimerRef.current = setTimeout(advance, wait);
    },
    [advance, collectResult, finishQuiz, hideOverlay, mode, showOverlay, suddenDeath],
  );

  const onTimeout = useCallback(async () => {
    if (!sessionId || locked || !q) return;

    lockAndReveal(null, null);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    soundManager.play('fail');
    showOverlay('timeout', 'Time up ⏳');

    // Tell backend (selected: null)
    try {
      const res: any = await api.post('/quiz/answer', {
        sessionId,
        questionId: q.id,
        selected: null,
      });
      handleResult(res.data, null);
    } catch {
      setTimeout(() => {
        finishQuiz();
      }, 1100);
    }
  }, [sessionId, locked, q, lockAndReveal, showOverlay, finishQuiz, handleResult]);

  /**
   * Re-check the clock the moment the app comes back to the foreground.
   *
   * JS timers are suspended while backgrounded, so without this the interval
   * simply resumes from where it stopped and the player sees time they no
   * longer have. Recomputing from the deadline shows the truth immediately —
   * including firing the timeout if the window closed while they were away,
   * rather than letting them submit an answer the server will reject.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const deadline = deadlineRef.current;
      if (deadline == null || locked || !sessionId) return;

      const remaining = Math.max(0, Math.ceil((deadline - serverNow()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        stopTimer();
        onTimeout();
      }
    });
    return () => sub.remove();
  }, [locked, sessionId, stopTimer, onTimeout]);

  const submitAnswer = useCallback(
    async (sel: number) => {
      if (!sessionId || locked || !q) return;

      soundManager.play('click');
      lockAndReveal(sel, null);

      try {
        const res: any = await api.post('/quiz/answer', {
          sessionId,
          questionId: q.id,
          selected: sel,
        });

        handleResult(res.data as AnswerRes, sel);
      } catch (e: any) {
        const status = e?.response?.status;
        const reason = e?.response?.data?.message;

        // A 400 here is the server rejecting the answer, not a transport
        // failure — usually the question's deadline passed. Unlocking silently
        // left the player tapping a button that would never work.
        if (status === 400 && /too late/i.test(reason ?? '')) {
          logger.debug('Answer rejected as late', { sessionId });
          showOverlay('timeout', "Time's up ⏱");
          setTimeout(() => finishQuiz(), 1100);
          return;
        }

        if (status === 409) {
          // The server already has an answer for this question — most often
          // because our first attempt succeeded and only its response was lost.
          // Returning here left the screen locked on a question the server had
          // moved past, and the run was stuck until the app was killed. Ask the
          // server where the run actually is and continue from there.
          logger.debug('Duplicate answer submit — resyncing', { sessionId });
          try {
            const st: any = await api.get(`/quiz/state/${sessionId}`, {
              retry: true,
            } as any);

            if (st.data.finished) {
              finishQuiz();
              return;
            }

            deadlineRef.current = deadlineFrom(st.data.deadlineAt, TIME_PER_QUESTION * 1000);

            hideOverlay();
            setLocked(false);
            setIndex(st.data.currentIndex ?? 0);
            resetPerQuestionUI();
          } catch {
            // Even the resync failed — collect whatever was scored rather
            // than stranding the player on a dead screen.
            finishQuiz();
          }
          return;
        }

        logger.error('Submit answer failed', e, { sessionId, status });
        setLocked(false);
        setSelected(null);
        Alert.alert(
          'Answer not sent',
          errorMessage(e, "That didn't go through. Tap your answer again."),
        );
      }
    },
    [
      sessionId,
      locked,
      q,
      lockAndReveal,
      resetPerQuestionUI,
      finishQuiz,
      showOverlay,
      hideOverlay,
      handleResult,
    ],
  );

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

  const handleHint = useCallback(async () => {
    if (!q || locked) return;
    if (!sessionId) return;
    if (hintsUsed >= 3) return;
    if (hintUsedThisQuestion) return;

    try {
      const res: any = await api.post('/quiz/hint', {
        sessionId,
        questionId: q.id,
      });

      const {
        disabledIndex,
        coins: newCoins,
        hintsUsed: serverHintsUsed,
      } = res.data || {};

      // update coins from backend (source of truth)
      if (typeof newCoins === 'number') {
        useCoinStore.getState().setCoins(newCoins);
      }

      // backend can optionally return hintsUsed; if so, trust it
      if (typeof serverHintsUsed === 'number') {
        setHintsUsed(serverHintsUsed);
      } else {
        // fallback: increment locally
        if (typeof disabledIndex === 'number') setHintsUsed((h) => h + 1);
      }

      if (typeof disabledIndex !== 'number') {
        // 🔥 NOT ENOUGH COINS → GO TO EARN ADS
        if (res?.data?.message === 'Not enough coins') {
          if (!rewardedAdsAvailable) {
            Alert.alert('Not enough coins', `You need ${hintCost} coins for a hint.`);
            return;
          }
          stopTimer(); // pause quiz
          router.push({
            pathname: '/earn/ads',
            params: {
              source: 'hint',
              sessionId,
              questionId: q.id,
            },
          });
        }
        return;
      }

      setDisabledOptions((prev) =>
        prev.includes(disabledIndex) ? prev : [...prev, disabledIndex],
      );

      setHintUsedThisQuestion(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e: any) {
      logger.debug('Hint request failed', { error: String(e) });
    }
  }, [q, locked, sessionId, hintsUsed, hintUsedThisQuestion]);

  const canHint = useMemo(() => {
    if (!q) return false;
    if (!sessionId) return false;
    if (locked) return false;
    if (hintsUsed >= 3) return false;
    if (hintUsedThisQuestion) return false;
    // optional UI check: show disabled if user can’t afford
    if (coins < hintCost) return false;
    return true;
  }, [q, sessionId, locked, hintsUsed, hintUsedThisQuestion, coins, hintCost]);

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
          
            accessibilityRole="button"
            accessibilityLabel="Go Home"
            hitSlop={8}>
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
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        {/* TOP BAR */}
        <View style={styles.topBar}>
          <View style={styles.topLeft}>
            <View
              style={[
                styles.categoryPill,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Text style={{ color: theme.colors.text, fontWeight: '800' }}>
                {mode === 'daily' ? 'Daily Quiz' : cap(category)}
              </Text>
            </View>

            <View
              style={[styles.diffPill, { backgroundColor: difficultyBadge.bg }]}
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
              {user?.avatar ? (
                <UserAvatar avatar={user.avatar} size={44} />
              ) : (
                <View
                  style={[
                    styles.avatarFallback,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                    },
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
                borderColor:
                  timeLeft <= 5 ? theme.colors.danger : theme.colors.border,
              },
            ]}
          >
            <Text
              style={{
                color:
                  timeLeft <= 5 ? theme.colors.danger : theme.colors.primary,
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
          <Text style={[styles.questionText, { color: theme.colors.text }]}>
            {q.question}
          </Text>
          {/* A wrong answer key ends the player's whole run, so give them a way
              to say so instead of just losing. */}
          <View style={{ alignItems: 'flex-end', marginTop: 4 }}>
            <ReportQuestionButton questionId={q.id} />
          </View>
        </Animated.View>

        {/* OPTIONS */}
        <View style={{ marginTop: 18, gap: 14 }}>
          {q.options.map((opt, i) => {
            const isDisabled = disabledOptions.includes(i);

            const hasResult = selected !== null || overlay?.type === 'timeout';
            const isCorrect =
              correctIndex !== null ? i === correctIndex : false;
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
                accessibilityRole="button"
                accessibilityLabel={`Answer ${i + 1}: ${opt}`}
                accessibilityState={{
                  disabled: locked || isDisabled || selected !== null,
                  selected: isSelected,
                }}
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
            hitSlop={8}>
                <Text style={{ color: txt, fontWeight: '700', fontSize: 15 }}>
                  {opt}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* EXPLANATION (replaces the footer while shown) */}
        {reveal ? (
          <View
            style={[
              styles.revealCard,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
            accessibilityLiveRegion="polite"
          >
            <Text
              style={{
                fontWeight: '900',
                fontSize: 15,
                color: reveal.verdict === 'correct' ? theme.colors.success : theme.colors.danger,
              }}
            >
              {reveal.verdict === 'correct'
                ? 'Correct ✅'
                : reveal.verdict === 'timeout'
                  ? "Time's up ⏱"
                  : 'Not quite ❌'}
            </Text>
            {correctIndex !== null && reveal.verdict !== 'correct' && q.options[correctIndex] ? (
              <Text style={{ color: theme.colors.text, marginTop: 4, fontWeight: '700' }}>
                Answer: {q.options[correctIndex]}
              </Text>
            ) : null}
            {reveal.explanation ? (
              <Text style={{ color: theme.colors.muted, marginTop: 6, lineHeight: 20 }}>
                💡 {reveal.explanation}
              </Text>
            ) : null}
            {reveal.action ? (
              <TouchableOpacity
                onPress={reveal.action === 'finish' ? finishQuiz : advance}
                style={[styles.primaryBtn, { backgroundColor: theme.colors.primary, marginTop: 12 }]}
                accessibilityRole="button"
                accessibilityLabel={reveal.action === 'finish' ? 'See results' : 'Next question'}
                hitSlop={8}
              >
                <Text style={{ color: '#fff', fontWeight: '800' }}>
                  {reveal.action === 'finish' ? 'See results' : 'Next question'}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={{ color: theme.colors.muted, marginTop: 10, fontSize: 12 }}>
                Next question in a moment…
              </Text>
            )}
          </View>
        ) : (
        <View style={styles.footer}>
          {paidHelp ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity
              disabled={!canHint}
              onPress={handleHint}
              style={[
                styles.hintBtn,
                {
                  backgroundColor: canHint
                    ? theme.colors.primary
                    : theme.colors.surface,
                  borderColor: theme.colors.border,
                  opacity: canHint ? 1 : 0.55,
                },
              ]}
            
            accessibilityRole="button"
            accessibilityLabel={`Hint, ${hintCost} coins. A hinted answer earns no leaderboard points.`}
            hitSlop={8}>
              <Text
                style={{
                  color: canHint ? '#fff' : theme.colors.muted,
                  fontWeight: '900',
                }}
              >
                Hint
              </Text>
              <Text
                style={{
                  color: canHint ? '#fff' : theme.colors.muted,
                  fontWeight: '700',
                  fontSize: 12,
                }}
              >
                {hintsUsed < 3 ? `${hintCost} coins` : 'Max'}
              </Text>
            </TouchableOpacity>

            <View
              style={[
                styles.coinsPill,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                💰 {coins}
              </Text>
            </View>
          </View>
          ) : (
            <Text style={{ color: theme.colors.muted, fontSize: 12, fontWeight: '700' }}>
              Same questions for everyone · no hints
            </Text>
          )}

          {paidHelp && (
          <TouchableOpacity
            onPress={handleExtendTime}
            accessibilityRole="button"
            accessibilityLabel="Buy 10 more seconds, 20 coins. That answer earns no leaderboard points."
            accessibilityState={{ disabled: locked || timeExtendedThisQuestion }}
            disabled={locked || timeExtendedThisQuestion}
            style={[
              styles.hintBtn,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
            hitSlop={8}>
            <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
              +10s
            </Text>
            <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
              20 coins
            </Text>
          </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={() => {
              if (mode !== 'daily' && mode !== 'duel') return router.back();
              // One attempt only: quitting ends it, so bank what was answered.
              Alert.alert('End your attempt?', "You can't replay this one. Unanswered questions count as wrong.", [
                { text: 'Keep playing', style: 'cancel' },
                {
                  text: 'End it',
                  style: 'destructive',
                  onPress: () => {
                    stopTimer();
                    finishQuiz();
                  },
                },
              ]);
            }}
            style={[
              styles.exitBtn,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          
            accessibilityRole="button"
            accessibilityLabel="Quit"
            hitSlop={8}>
            <Text style={{ color: theme.colors.muted, fontWeight: '900' }}>
              Quit
            </Text>
          </TouchableOpacity>
        </View>
        )}

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
              <Text
                style={{
                  color: '#fff',
                  opacity: 0.9,
                  marginTop: 2,
                  fontWeight: '700',
                }}
              >
                {overlay.type === 'correct'
                  ? 'Keep going!'
                  : overlay.type === 'timeout'
                    ? 'Be faster next time.'
                    : suddenDeath
                      ? 'Game over.'
                      : 'Keep going!'}
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

  revealCard: {
    marginTop: 'auto',
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
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
