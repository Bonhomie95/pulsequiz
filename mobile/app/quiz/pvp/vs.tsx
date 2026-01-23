import { useEffect, useRef, useState } from 'react';
import { View, Text, Image, Animated, Easing, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { getSocket } from '@/src/socket/socket';
import { SOCKET_EVENTS } from '../../../src/socket/events';
import { usePvPStore } from '@/src/store/usePvPStore';
import { useTheme } from '@/src/theme/useTheme';
import { AVATAR_MAP } from '@/src/constants/avatars';
import { soundManager } from '@/src/audio/SoundManager';
import { connectSocket } from '@/src/socket/connect';

function resolveAvatar(key?: string | null) {
  if (!key) return AVATAR_MAP.avatar0;
  return AVATAR_MAP[key as keyof typeof AVATAR_MAP] ?? AVATAR_MAP.avatar0;
}

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

  useEffect(() => {
    socket.emit(SOCKET_EVENTS.MATCH_START, {
      matchId: usePvPStore.getState().matchId,
    });
  }, []);

  /* ---------------- MATCH START ---------------- */
  useEffect(() => {
    socket.on(SOCKET_EVENTS.MATCH_START, ({ questions }) => {
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
    });

    return () => {
      socket.off(SOCKET_EVENTS.MATCH_START);
    };
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

  if (!me || !opponent) return null;

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
            <Image
              source={resolveAvatar(me.avatar)}
              style={{ width: 64, height: 64, borderRadius: 32 }}
            />
            <Text style={{ fontWeight: '800', color: theme.colors.text }}>
              {me.username}
            </Text>
            <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
              Lv {me.level} • #{me.allTimeRank}
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
            <Image
              source={resolveAvatar(opponent.avatar)}
              style={{ width: 64, height: 64, borderRadius: 32 }}
            />
            <Text style={{ fontWeight: '800', color: theme.colors.text }}>
              {opponent.username}
            </Text>
            <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
              Lv {opponent.level} • #{opponent.allTimeRank}
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
