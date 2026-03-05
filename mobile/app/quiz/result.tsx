import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { ScrollView, Share, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Share2 } from 'lucide-react-native';
import { showInterstitialAd } from '@/src/ads/admob';
import { soundManager } from '@/src/audio/SoundManager';
import { useTheme } from '@/src/theme/useTheme';
import { enterImmersiveMode, exitImmersiveMode } from '@/src/utils/immersive';
import { useAppStateStore } from '@/src/store/useAppStateStore';

const SCORE_MESSAGES = [
  { min: 100, emoji: '🏆', text: "Perfect score! You're unstoppable!" },
  { min: 80, emoji: '🔥', text: 'On fire! Top of the leaderboard incoming!' },
  { min: 60, emoji: '💪', text: 'Solid quiz! Keep climbing!' },
  { min: 0, emoji: '🎯', text: 'Good effort! Try again to beat your score!' },
];

function getShareMessage(
  correctNum: number,
  totalNum: number,
  pointsNum: number,
  accuracyNum: number,
): string {
  const msg =
    SCORE_MESSAGES.find((m) => accuracyNum >= m.min) ?? SCORE_MESSAGES[3];
  return `${msg.emoji} Just scored ${pointsNum} pts on PulseQuiz! (${correctNum}/${totalNum} correct, ${accuracyNum}% accuracy)\n\n${msg.text}\n\nChallenge me 👉 https://pulsequiz.app`;
}

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

  /* ---------------- SOUND + ADS ONCE ---------------- */
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
      soundManager.stopEffects();
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

  const goHome = () => router.replace('/(tabs)/home');
  const startAnotherQuiz = () => router.replace('/quiz/categories');

  const shareResult = async () => {
    try {
      await Share.share({
        message: getShareMessage(correctNum, totalNum, pointsNum, accuracyNum),
        title: 'PulseQuiz Score',
      });
    } catch {
      /* user cancelled */
    }
  };

  /* ---------------- UI ---------------- */
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{ fontSize: 28, fontWeight: '800', color: theme.colors.text }}
        >
          Quiz Complete 🎯
        </Text>
        <Text style={{ color: theme.colors.muted, marginTop: 6 }}>
          {correctNum} / {totalNum} correct • {accuracyNum}% accuracy
        </Text>

        {/* Points card */}
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

        {/* Level up banner */}
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
              🚀 Level Up! You are now Level {level}
            </Text>
          </View>
        )}

        {/* Actions */}
        <View style={{ marginTop: 32, gap: 14 }}>
          {/* Start Another Quiz */}
          <TouchableOpacity
            onPress={startAnotherQuiz}
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
          </TouchableOpacity>

          {/* Share Result */}
          <TouchableOpacity
            onPress={shareResult}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              backgroundColor: theme.colors.surface,
              paddingVertical: 16,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: theme.colors.primary + '60',
            }}
          >
            <Share2 size={18} color={theme.colors.primary} />
            <Text
              style={{
                color: theme.colors.primary,
                fontWeight: '800',
                fontSize: 15,
              }}
            >
              Share Result
            </Text>
          </TouchableOpacity>

          {/* Back to Home */}
          <TouchableOpacity
            onPress={goHome}
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
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
