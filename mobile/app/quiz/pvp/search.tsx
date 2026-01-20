import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getSocket } from '@/src/socket/socket';
import { SOCKET_EVENTS } from '../../../src/socket/events';
import { usePvPStore } from '@/src/store/usePvPStore';
import { useTheme } from '@/src/theme/useTheme';
import { soundManager } from '@/src/audio/SoundManager';

const TIPS = [
  'Speed matters more than perfection in PvP',
  'Both players get unseen questions',
  'Ties are broken by response time',
  'Leaving the app for 60s = forfeit',
];

export default function PvPSearchScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const router = useRouter();
  const socket = getSocket();
  const theme = useTheme();

  const { setSearching, reset } = usePvPStore();

  const [tipIndex, setTipIndex] = useState(0);
  const pulse = useRef(new Animated.Value(1)).current;
  const tipInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ---------------- ANIMATIONS ---------------- */

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.15,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  /* ---------------- ROTATING TIPS ---------------- */

  useEffect(() => {
    tipInterval.current = setInterval(() => {
      setTipIndex((i) => (i + 1) % TIPS.length);
    }, 2500);

    return () => {
      if (tipInterval.current) clearInterval(tipInterval.current);
      tipInterval.current = null;
    };
  }, []);

  /* ---------------- SOCKET ---------------- */

  useEffect(() => {
    if (!category) return;

    setSearching(category);
    socket.emit(SOCKET_EVENTS.JOIN_QUEUE, { category });

    socket.on(SOCKET_EVENTS.MATCHED, (payload) => {
      soundManager.play('match_found'); // 🔊 subtle ping
      usePvPStore.getState().setMatched(payload);
      router.replace('/quiz/pvp/vs' as const);
    });

    socket.on(SOCKET_EVENTS.QUEUE_TIMEOUT, () => {
      reset();
      router.replace(`/quiz/play?category=${category}` as const);
    });

    socket.on(SOCKET_EVENTS.ERROR, () => {
      reset();
      router.back();
    });

    return () => {
      socket.emit(SOCKET_EVENTS.LEAVE_QUEUE, { category });
      socket.off(SOCKET_EVENTS.MATCHED);
      socket.off(SOCKET_EVENTS.QUEUE_TIMEOUT);
      socket.off(SOCKET_EVENTS.ERROR);
    };
  }, [category]);

  /* ---------------- ACTIONS ---------------- */

  const cancelSearch = () => {
    socket.emit(SOCKET_EVENTS.LEAVE_QUEUE, { category });
    reset();
    router.back();
  };

  /* ---------------- UI ---------------- */

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
      }}
    >
      <View
        style={{
          flex: 1,
          padding: 24,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {/* Spinner */}
        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </Animated.View>

        <Text
          style={{
            marginTop: 28,
            fontSize: 20,
            fontWeight: '800',
            color: theme.colors.text,
          }}
        >
          Finding opponent…
        </Text>

        {/* Category pill */}
        <View
          style={{
            marginTop: 14,
            paddingVertical: 8,
            paddingHorizontal: 16,
            borderRadius: 999,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Text
            style={{
              color: theme.colors.text,
              fontWeight: '700',
              fontSize: 13,
            }}
          >
            {category}
          </Text>
        </View>

        {/* Tip */}
        <Text
          style={{
            marginTop: 26,
            fontSize: 13,
            color: theme.colors.muted,
            textAlign: 'center',
            lineHeight: 18,
          }}
        >
          💡 {TIPS[tipIndex]}
        </Text>

        {/* Cancel */}
        <TouchableOpacity
          onPress={cancelSearch}
          style={{
            marginTop: 36,
            paddingVertical: 14,
            paddingHorizontal: 28,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
        >
          <Text
            style={{
              color: theme.colors.text,
              fontWeight: '700',
              fontSize: 14,
            }}
          >
            Leave queue
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
