import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

import { getSocket } from '@/src/socket/socket';
import { SOCKET_EVENTS } from '../../../src/socket/events';
import { usePvPStore } from '@/src/store/usePvPStore';
import { useTheme } from '@/src/theme/useTheme';
import { soundManager } from '@/src/audio/SoundManager';
import { CountdownRing } from '../../../src/components/CountdownRing';

import { connectSocket } from '@/src/socket/connect';
const TOTAL_Q = 10;
const TIME_PER_QUESTION = 15;
const WARNING_TIME = 5;

export default function PvPPlayScreen() {
  const socket = getSocket();
  const router = useRouter();
  const theme = useTheme();

  const {
    matchId,
    questions,
    currentIndex,
    opponentFurthest,
    status,
    me,
    opponent,
  } = usePvPStore();

  const question = questions[currentIndex];

  /* ---------------- ANIMATIONS ---------------- */
  const myBar = useRef(new Animated.Value(0)).current;
  const oppBar = useRef(new Animated.Value(0)).current;
  const ringProgress = useRef(new Animated.Value(0)).current;

  /* ---------------- TIMER ---------------- */
  const [secondsLeft, setSecondsLeft] = useState(TIME_PER_QUESTION);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ---------------- EFFECTS ---------------- */
  useEffect(() => {
    Animated.spring(myBar, {
      toValue: (currentIndex + 1) / TOTAL_Q,
      useNativeDriver: false,
    }).start();

    Animated.spring(oppBar, {
      toValue: opponentFurthest / TOTAL_Q,
      useNativeDriver: false,
    }).start();
  }, [currentIndex, opponentFurthest]);

  /* ---------------- COUNTDOWN ---------------- */
  useEffect(() => {
    ringProgress.setValue(0);
    setSecondsLeft(TIME_PER_QUESTION);

    Animated.timing(ringProgress, {
      toValue: 1,
      duration: TIME_PER_QUESTION * 1000,
      useNativeDriver: false,
    }).start();

    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current!);
          submitTimeout();
          return 0;
        }

        if (s <= WARNING_TIME) {
          soundManager.play('countdown');
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }

        return s - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentIndex]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        connectSocket();

        const matchId = usePvPStore.getState().matchId;
        if (matchId) {
          // re-ready / rejoin
          getSocket().emit(SOCKET_EVENTS.MATCH_START, { matchId });
        }
      }
    });

    return () => sub.remove();
  }, []);

  useEffect(() => {
    const matchId = usePvPStore.getState().matchId;
    if (!matchId) return;

    const t = setInterval(() => {
      getSocket().emit('match:ping', { matchId });
    }, 7000);

    return () => clearInterval(t);
  }, []);

  const submitTimeout = () => {
    if (!matchId || !question) return;

    socket.emit(SOCKET_EVENTS.ANSWER, {
      matchId,
      questionId: question.id,
      selected: null,
      index: currentIndex,
      elapsedMs: TIME_PER_QUESTION * 1000,
    });
  };

  /* ---------------- SOCKET ---------------- */
  useEffect(() => {
    socket.on(SOCKET_EVENTS.PLAYER_UPDATE, (payload) => {
      usePvPStore.getState().updateProgress(payload);
    });

    socket.on(SOCKET_EVENTS.WAITING, () => {
      usePvPStore.getState().setWaiting();
    });

    socket.on(SOCKET_EVENTS.MATCH_FINISHED, (payload) => {
      usePvPStore.getState().finishMatch(payload.winnerUserId);
      router.replace('/quiz/pvp/result' as const);
    });

    return () => {
      socket.off(SOCKET_EVENTS.PLAYER_UPDATE);
      socket.off(SOCKET_EVENTS.WAITING);
      socket.off(SOCKET_EVENTS.MATCH_FINISHED);
    };
  }, []);

  if (!question) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: theme.colors.muted }}>Waiting…</Text>
      </View>
    );
  }

  const answer = (index: number) => {
    socket.emit(SOCKET_EVENTS.ANSWER, {
      matchId,
      questionId: question.id,
      selected: index,
      index: currentIndex,
      elapsedMs: (TIME_PER_QUESTION - secondsLeft) * 1000,
    });
  };

  /* ---------------- UI ---------------- */
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* TOP */}
      <View style={{ padding: 16 }}>
        <Text style={{ color: theme.colors.text }}>{me?.username}</Text>
        <Animated.View
          style={{
            height: 6,
            borderRadius: 6,
            backgroundColor: theme.colors.primary,
            width: myBar.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%'],
            }),
          }}
        />

        <Text style={{ color: theme.colors.muted, marginTop: 8 }}>
          {opponent?.username}
        </Text>
        <Animated.View
          style={{
            height: 6,
            borderRadius: 6,
            backgroundColor: theme.colors.muted,
            width: oppBar.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%'],
            }),
          }}
        />
      </View>

      {/* QUESTION */}
      <View style={{ padding: 20, flex: 1 }}>
        <CountdownRing
          progress={ringProgress}
          color={secondsLeft <= WARNING_TIME ? '#ef4444' : theme.colors.primary}
          bg={theme.colors.border}
        />

        <Text
          style={{
            marginTop: 16,
            fontSize: 18,
            fontWeight: '800',
            color: theme.colors.text,
          }}
        >
          {question.question}
        </Text>

        {question.options.map((opt, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => answer(i)}
            style={{
              padding: 16,
              marginTop: 12,
              borderRadius: 16,
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text style={{ color: theme.colors.text }}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* OPPONENT FAILED */}
      {status === 'waiting' && (
        <View
          style={{
            position: 'absolute',
            bottom: 40,
            alignSelf: 'center',
            backgroundColor: theme.colors.surface,
            paddingHorizontal: 20,
            paddingVertical: 10,
            borderRadius: 20,
          }}
        >
          <Text style={{ color: theme.colors.text }}>
            Opponent has failed — finishing…
          </Text>
        </View>
      )}
    </View>
  );
}
