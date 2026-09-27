import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  Easing,
  AppState,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { getSocket } from '@/src/socket/socket';
import { SOCKET_EVENTS } from '../../../src/socket/events';
import { usePvPStore } from '@/src/store/usePvPStore';
import { useTheme } from '@/src/theme/useTheme';
import { UserAvatar } from '@/src/components/UserAvatar';
import { soundManager } from '@/src/audio/SoundManager';
import { connectSocket } from '@/src/socket/connect';

export default function PvPVsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const socket = getSocket();

  const { me, opponent } = usePvPStore();

  const leftX = useRef(new Animated.Value(-120)).current;
  const rightX = useRef(new Animated.Value(120)).current;
  const vsPulse = useRef(new Animated.Value(1)).current;
  const countdownAnim = useRef(new Animated.Value(0)).current;

  const [countdown, setCountdown] = useState<3 | 2 | 1 | null>(null);

  /* ---------------- ENTRY ANIMATION ---------------- */
  useEffect(() => {
    Animated.parallel([
      Animated.timing(leftX, {
        toValue: 0,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(rightX, {
        toValue: 0,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(vsPulse, {
          toValue: 1.1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(vsPulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  // Keep asking until the question set is in the store.
  //
  // One emit on mount was enough only when nothing went wrong: the request can
  // race a reconnect, and on a rematch the app-wide listener has usually
  // already asked and had the reply before this screen mounted. Re-asking is
  // cheap and idempotent — the server just re-sends the set.
  useEffect(() => {
    const ask = () => {
      const matchId = usePvPStore.getState().matchId;
      if (matchId) socket.emit(SOCKET_EVENTS.MATCH_START, { matchId });
    };
    ask();
    const t = setInterval(() => {
      if (usePvPStore.getState().questions.length > 0) return;
      ask();
    }, 1_500);
    return () => clearInterval(t);
  }, []);

  /* ---------------- MATCH START ---------------- */
  // Driven by the store, not by catching the MATCH_START event.
  //
  // The app-wide listener also handles MATCH_START and writes the questions to
  // the store, and on a rematch it had already asked for them — so the reply
  // routinely landed before this screen mounted and its own listener heard
  // nothing. The countdown then never ran and the match never opened. Reading
  // what is already in the store cannot lose that race.
  const questions = usePvPStore((s) => s.questions);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const begin = (questions: any[]) => {
      if (!questions?.length) return;
      if (countdownRef.current) return; // a replay mustn't restart the count
      soundManager.play('match_found');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      let i: 3 | 2 | 1 = 3;
      setCountdown(i);

      const interval = setInterval(() => {
        i = (i - 1) as 2 | 1;
        setCountdown(i ?? null);

        Animated.sequence([
          Animated.timing(countdownAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(countdownAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start();

        if (i === 1) {
          clearInterval(interval);
          setTimeout(() => {
            usePvPStore.getState().startMatch(questions);
            router.replace('/quiz/pvp/play' as const);
          }, 500);
        }
      }, 800);
      countdownRef.current = interval;
    };

    // Whichever comes first: what is already there, or what arrives next.
    begin(questions);
    const onMatchStart = ({ questions: qs }: { questions: any[] }) => begin(qs);
    socket.on(SOCKET_EVENTS.MATCH_START, onMatchStart);

    return () => {
      // By reference — a bare off() would remove the global MATCH_START
      // listener that reconnect/resume in pvp/play relies on.
      socket.off(SOCKET_EVENTS.MATCH_START, onMatchStart);
    };
  }, [questions]);

  useEffect(() => () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

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

  // Never `return null` here: an empty render is a white screen with no way
  // out, which is how a missing pairing used to look to the player. It should
  // also look like the rest of the app while it waits, not like a stall.
  if (!me || !opponent) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <Animated.View
          style={{
            transform: [{ scale: vsPulse }],
            width: 108,
            height: 108,
            borderRadius: 54,
            backgroundColor: theme.colors.primary + '1A',
            borderWidth: 2,
            borderColor: theme.colors.primary + '55',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 34, fontWeight: '900', color: theme.colors.primary }}>
            VS
          </Text>
        </Animated.View>

        <Text
          style={{
            marginTop: 24,
            fontSize: 20,
            fontWeight: '900',
            color: theme.colors.text,
            letterSpacing: -0.3,
          }}
        >
          Setting up your match
        </Text>
        <Text
          style={{
            marginTop: 6,
            fontSize: 14,
            color: theme.colors.muted,
            textAlign: 'center',
            lineHeight: 20,
          }}
        >
          Dealing the same ten questions to both of you.
        </Text>

        <ActivityIndicator
          color={theme.colors.primary}
          style={{ marginTop: 22 }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <View style={{ alignItems: 'center' }}>
        {/* PLAYERS */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          {/* ME */}
          <Animated.View
            style={{
              transform: [{ translateX: leftX }],
              backgroundColor: theme.colors.surface,
              padding: 16,
              borderRadius: 20,
              width: 140,
              alignItems: 'center',
            }}
          >
            <UserAvatar avatar={me.avatar} size={64} />
            <Text style={{ fontWeight: '800', color: theme.colors.text }}>
              {me.username}
            </Text>
            {/* Real numbers. The rank here was hardcoded to 0 on the
                server, so every player was introduced as "#0". */}
            <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
              Lv {me.level}
              {me.allTimeRank ? ` • #${me.allTimeRank}` : ''}
            </Text>
            <Text style={{ color: theme.colors.muted, fontSize: 11 }}>
              {me.points ?? 0} pts
            </Text>
          </Animated.View>

          {/* VS */}
          <Animated.Text
            style={{
              fontSize: 34,
              fontWeight: '900',
              color: theme.colors.primary,
              transform: [{ scale: vsPulse }],
            }}
          >
            VS
          </Animated.Text>

          {/* OPPONENT */}
          <Animated.View
            style={{
              transform: [{ translateX: rightX }],
              backgroundColor: theme.colors.surface,
              padding: 16,
              borderRadius: 20,
              width: 140,
              alignItems: 'center',
            }}
          >
            <UserAvatar avatar={opponent.avatar} size={64} />
            <Text style={{ fontWeight: '800', color: theme.colors.text }}>
              {opponent.username}
            </Text>
            <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
              Lv {opponent.level}
              {opponent.allTimeRank ? ` • #${opponent.allTimeRank}` : ''}
            </Text>
            <Text style={{ color: theme.colors.muted, fontSize: 11 }}>
              {opponent.points ?? 0} pts
            </Text>
          </Animated.View>
        </View>

        {/* COUNTDOWN */}
        {countdown && (
          <Animated.Text
            style={{
              marginTop: 36,
              fontSize: 42,
              fontWeight: '900',
              color: theme.colors.primary,
              opacity: countdownAnim,
              transform: [{ scale: countdownAnim }],
            }}
          >
            {countdown}
          </Animated.Text>
        )}
      </View>
    </SafeAreaView>
  );
}
