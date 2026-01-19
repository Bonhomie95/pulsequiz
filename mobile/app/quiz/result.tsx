import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { showInterstitialAd } from '@/src/ads/admob';
import { soundManager } from '@/src/audio/SoundManager';
import { useTheme } from '@/src/theme/useTheme';
import { enterImmersiveMode, exitImmersiveMode } from '@/src/utils/immersive';
import { useAppStateStore } from '@/src/store/useAppStateStore';

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

    (async () => {
      const raw = await AsyncStorage.getItem('SESSIONS_SINCE_AD');
      const count = Number(raw ?? 0) + 1;

      if (count >= 2) {
        await AsyncStorage.setItem('SESSIONS_SINCE_AD', '0');
        await showInterstitialAd();
      } else {
        await AsyncStorage.setItem('SESSIONS_SINCE_AD', String(count));
      }
    })();

    if (didLevelUp) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    return () => {
      // 🔒 Global manager handles cleanup safely
      // soundManager.stop();
    };
  }, []);

  useEffect(() => {
    if (playedRef.current) return;
    playedRef.current = true;

    // 🚫 Stop background music
    soundManager.enterResultMode();

    if (perfect) {
      soundManager.play('victory');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      soundManager.play('fail');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    if (didLevelUp) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    return () => {
      // 🧹 Stop result sound
      soundManager.stopEffects();

      // ▶️ Resume background music
      soundManager.exitResultMode();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      enterImmersiveMode();
      return () => exitImmersiveMode();
    }, []),
  );

  useEffect(() => {
    useAppStateStore.getState().setPlayingQuiz(true);
    return () => {
      useAppStateStore.getState().setPlayingQuiz(false);
    };
  }, []);

  const goHome = () => {
    router.replace('/(tabs)/home');
  };

  const startAnotherQuiz = () => {
    router.replace('/quiz/categories'); // adjust if your categories route differs
  };

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

        <View style={{ marginTop: 32, gap: 14 }}>
          {/* Start Another Quiz */}
          <View
            onTouchEnd={startAnotherQuiz}
            style={{
              backgroundColor: theme.colors.primary,
              paddingVertical: 16,
              borderRadius: 18,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>
              🔁 Start Another Quiz
            </Text>
          </View>

          {/* Back to Home */}
          <View
            onTouchEnd={goHome}
            style={{
              backgroundColor: theme.colors.surface,
              paddingVertical: 16,
              borderRadius: 18,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text
              style={{
                color: theme.colors.text,
                fontWeight: '800',
                fontSize: 15,
              }}
            >
              🏠 Back to Home
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
