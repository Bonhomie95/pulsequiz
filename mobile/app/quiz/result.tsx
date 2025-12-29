import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/src/theme/useTheme';

export default function QuizResult() {
  const theme = useTheme();
  const router = useRouter();

  const { correct, total, points, level, accuracy, leveledUp } =
    useLocalSearchParams<{
      correct: string;
      total: string;
      points: string;
      level: string;
      accuracy: string;
      leveledUp?: string;
    }>();

  const soundRef = useRef<Audio.Sound | null>(null);
  const playedRef = useRef(false);

  const correctNum = Number(correct);
  const totalNum = Number(total);
  const pointsNum = Number(points);
  const accuracyNum = Number(accuracy);
  const didLevelUp = leveledUp === 'true';

  const perfect = correctNum === totalNum;

  /* ---------------- PLAY SOUND ONCE ---------------- */
  useEffect(() => {
    if (playedRef.current) return;
    playedRef.current = true;

    async function play() {
      const source = perfect
        ? require('@/assets/sounds/victory.mp3')
        : require('@/assets/sounds/fail.mp3');

      const { sound } = await Audio.Sound.createAsync(source);
      soundRef.current = sound;
      await sound.playAsync();

      if (perfect) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      if (didLevelUp) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }

    play();

    return () => {
      // 🔥 STOP SOUND ON LEAVE
      soundRef.current?.stopAsync();
      soundRef.current?.unloadAsync();
    };
  }, []);

  /* ---------------- UI ---------------- */
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{
            fontSize: 28,
            fontWeight: '800',
            color: theme.colors.text,
          }}
        >
          Quiz Complete 🎯
        </Text>

        <Text style={{ color: theme.colors.muted, marginTop: 6 }}>
          {correctNum} / {totalNum} correct • {accuracyNum}% accuracy
        </Text>

        <View
          style={{
            marginTop: 24,
            padding: 20,
            borderRadius: 20,
            backgroundColor: theme.colors.surface,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: theme.colors.coin }}>Points Earned</Text>
          <Text
            style={{
              fontSize: 36,
              fontWeight: '900',
              color: theme.colors.coin,
            }}
          >
            +{pointsNum}
          </Text>
        </View>

        {didLevelUp && (
          <View
            style={{
              marginTop: 20,
              padding: 16,
              borderRadius: 18,
              backgroundColor: theme.colors.primary,
            }}
          >
            <Text
              style={{
                color: '#fff',
                fontWeight: '800',
                fontSize: 16,
                textAlign: 'center',
              }}
            >
              🚀 Level Up! You’re now Level {level}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
