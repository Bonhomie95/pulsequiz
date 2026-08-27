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
import { ReportQuestionButton } from '@/src/components/ReportQuestionSheet';
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
    error,
    deadlineAt,
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

  /* ---------------- CONNECTION / RECOVERY ---------------- */
  const [connected, setConnected] = useState(socket.connected);
  const [showRecovery, setShowRecovery] = useState(false);

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
  // Driven by the server's deadline, not a local 15-second reset. After a
  // reconnect the server's clock has kept running; showing a fresh 15s would
  // let a player answer inside a window the server has already closed, and
  // then be told they timed out.
  useEffect(() => {
    const remaining = deadlineAt
      ? Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000))
      : TIME_PER_QUESTION;

    ringProgress.setValue(1 - remaining / TIME_PER_QUESTION);
    setSecondsLeft(remaining);

    if (remaining <= 0) {
      submitTimeout();
      return;
    }

    Animated.timing(ringProgress, {
      toValue: 1,
      duration: remaining * 1000,
      useNativeDriver: false,
    }).start();

    timerRef.current = setInterval(() => {
      setSecondsLeft((sec) => {
        if (sec <= 1) {
          clearInterval(timerRef.current!);
          submitTimeout();
          return 0;
        }

        if (sec <= WARNING_TIME) {
          soundManager.play('countdown');
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }

        return sec - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, deadlineAt]);

  // Resync the match after returning from background (socket may have dropped).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') resync();
    });
    return () => sub.remove();
  }, []);

  // Track live connection state so we can surface a recovery UI, and resync
  // automatically the moment the socket comes back.
  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      resync();
    };
    const onDisconnect = () => setConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    setConnected(socket.connected);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navigate to results from the store status (updated by the global PvP
  // listeners) rather than a local socket handler — a local handler + a bare
  // socket.off(EVENT) would tear down the shared listeners too.
  useEffect(() => {
    if (status === 'finished') router.replace('/quiz/pvp/result' as const);
  }, [status, router]);

  // Watchdog: if the socket stays down (or the match never delivers questions)
  // for a while, offer an escape hatch instead of a permanent "Waiting…".
  useEffect(() => {
    if (status === 'finished') {
      setShowRecovery(false);
      return;
    }
    const stalled = !connected || !question;
    if (!stalled) {
      setShowRecovery(false);
      return;
    }
    const t = setTimeout(() => setShowRecovery(true), 12000);
    return () => clearTimeout(t);
  }, [connected, question, status]);

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

  /* ---------------- RECOVERY ACTIONS ---------------- */
  // Reconnect the socket and ask the server to resend our current match state.
  const resync = () => {
    connectSocket();
    const mid = usePvPStore.getState().matchId;
    if (mid) getSocket().emit(SOCKET_EVENTS.MATCH_START, { matchId: mid });
  };

  const tryReconnect = () => {
    setShowRecovery(false);
    resync();
  };

  const leaveMatch = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    usePvPStore.getState().reset();
    router.replace('/(tabs)/home');
  };

  if (!question) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
        >
          <Text style={{ color: theme.colors.muted }}>
            {connected ? 'Waiting…' : 'Reconnecting…'}
          </Text>
        </View>
        <RecoveryOverlay
          visible={showRecovery}
          connected={connected}
          theme={theme}
          onReconnect={tryReconnect}
          onLeave={leaveMatch}
        />
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

        <View style={{ alignItems: 'flex-end' }}>
          <ReportQuestionButton questionId={question.id} compact />
        </View>

        {/* A rejected answer is a per-action problem — say so in place rather
            than ejecting the player from a match they have coins staked on. */}
        {error && (
          <View
            style={{
              marginTop: 12,
              padding: 10,
              borderRadius: 12,
              backgroundColor: theme.colors.danger + '18',
              borderWidth: 1,
              borderColor: theme.colors.danger + '44',
            }}
          >
            <Text style={{ color: theme.colors.danger, fontSize: 13, fontWeight: '700' }}>
              {error}
            </Text>
          </View>
        )}

        {question.options.map((opt, i) => (
          <TouchableOpacity
            key={i}
            accessibilityRole="button"
            accessibilityLabel={`Answer ${i + 1}: ${opt}`}
            onPress={() => answer(i)}
            style={{
              padding: 16,
              marginTop: 12,
              borderRadius: 16,
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
            hitSlop={8}>
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

      {/* RECONNECTING BANNER */}
      {!connected && !showRecovery && (
        <View
          style={{
            position: 'absolute',
            top: 12,
            alignSelf: 'center',
            backgroundColor: '#ef444422',
            paddingHorizontal: 16,
            paddingVertical: 6,
            borderRadius: 16,
          }}
        >
          <Text style={{ color: '#ef4444', fontWeight: '700', fontSize: 12 }}>
            Reconnecting…
          </Text>
        </View>
      )}

      <RecoveryOverlay
        visible={showRecovery}
        connected={connected}
        theme={theme}
        onReconnect={tryReconnect}
        onLeave={leaveMatch}
      />
    </View>
  );
}

/* ---------------- RECOVERY OVERLAY ---------------- */
function RecoveryOverlay({
  visible,
  connected,
  theme,
  onReconnect,
  onLeave,
}: {
  visible: boolean;
  connected: boolean;
  theme: ReturnType<typeof useTheme>;
  onReconnect: () => void;
  onLeave: () => void;
}) {
  if (!visible) return null;
  return (
    <View
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: '#000000cc',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
      }}
    >
      <Text style={{ fontSize: 44, marginBottom: 12 }}>📡</Text>
      <Text
        style={{
          color: '#fff',
          fontSize: 20,
          fontWeight: '900',
          marginBottom: 8,
          textAlign: 'center',
        }}
      >
        Connection problem
      </Text>
      <Text
        style={{
          color: '#A6B0CF',
          fontSize: 14,
          lineHeight: 21,
          textAlign: 'center',
          marginBottom: 28,
        }}
      >
        {connected
          ? "We're having trouble reaching the match. You can retry or leave."
          : "You appear to be offline. We'll keep trying to reconnect."}
      </Text>
      <TouchableOpacity
        onPress={onReconnect}
        accessibilityRole="button"
        accessibilityLabel="Try to reconnect"
        style={{
          backgroundColor: theme.colors.primary,
          paddingHorizontal: 32,
          paddingVertical: 14,
          borderRadius: 16,
          marginBottom: 12,
          minWidth: 200,
        }}
      >
        <Text
          style={{
            color: '#fff',
            fontWeight: '800',
            fontSize: 15,
            textAlign: 'center',
          }}
        >
          Try again
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onLeave}
        accessibilityRole="button"
        accessibilityLabel="Leave match"
        style={{ paddingHorizontal: 32, paddingVertical: 12 }}
      >
        <Text style={{ color: '#A6B0CF', fontWeight: '700', fontSize: 14 }}>
          Leave match
        </Text>
      </TouchableOpacity>
    </View>
  );
}
