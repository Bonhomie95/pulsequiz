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
import { LINKS, duelLink } from '@/src/constants/links';
import { dailyNumber, resultGrid } from '@/src/utils/share';

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
  return `${msg.emoji} Just scored ${pointsNum} pts on PulseQuiz! (${correctNum}/${totalNum} correct, ${accuracyNum}% accuracy)\n\n${msg.text}\n\nChallenge me 👉 ${LINKS.WEBSITE}`;
}

export default function QuizResult() {
  const theme = useTheme();
  const router = useRouter();

  const {
    correct,
    total,
    points,
    level,
    accuracy,
    leveledUp,
    assisted,
    capExceeded,
    mode = 'classic',
    results = '',
    leagueXp,
    dailyDate,
    duelCode,
  } = useLocalSearchParams<{
      mode?: string;
      results?: string;
      leagueXp?: string;
      dailyDate?: string;
      duelCode?: string;
      correct: string;
      total: string;
      points: string;
      assisted?: string;
      capExceeded?: string;
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
  const ranked = mode === 'classic';
  const xpNum = Number(leagueXp ?? 0);

  /* ---------------- SOUND + ADS ONCE ---------------- */
  useEffect(() => {
    if (playedRef.current) return;
    playedRef.current = true;

    // At most one interstitial every 4 runs, and none in a new player's
    // first 5 — the first sessions decide whether they stay.
    (async () => {
      try {
        const [rawSince, rawTotal] = await Promise.all([
          AsyncStorage.getItem('SESSIONS_SINCE_AD'),
          AsyncStorage.getItem('RUNS_TOTAL'),
        ]);
        const runs = Number(rawTotal ?? 0) + 1;
        const since = Number(rawSince ?? 0) + 1;
        await AsyncStorage.setItem('RUNS_TOTAL', String(runs));
        if (runs > 5 && since >= 4) {
          await AsyncStorage.setItem('SESSIONS_SINCE_AD', '0');
          await showInterstitialAd();
        } else {
          await AsyncStorage.setItem('SESSIONS_SINCE_AD', String(since));
        }
      } catch {
        /* storage unavailable — skip the ad rather than risk one every run */
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

  const shareMessage = () => {
    if (mode === 'daily' && dailyDate) {
      return `PulseQuiz Daily #${dailyNumber(dailyDate)}  ${correctNum}/${totalNum}\n${resultGrid(results)}\n\n${LINKS.WEBSITE}`;
    }
    if (mode === 'duel' && duelCode) {
      return `I got ${correctNum}/${totalNum} on PulseQuiz. Same 10 questions — can you beat me?\n${resultGrid(results)}\n\n👉 ${duelLink(duelCode)}\n(or enter code ${duelCode} in the app)`;
    }
    return getShareMessage(correctNum, totalNum, pointsNum, accuracyNum);
  };

  const shareResult = async () => {
    try {
      await Share.share({ message: shareMessage(), title: 'PulseQuiz' });
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
          {mode === 'daily'
            ? `Daily #${dailyDate ? dailyNumber(dailyDate) : ''} done 📅`
            : mode === 'duel'
              ? 'Challenge played 🤝'
              : mode === 'relaxed'
                ? 'Practice complete 📘'
                : 'Quiz Complete 🎯'}
        </Text>
        <Text style={{ color: theme.colors.muted, marginTop: 6 }}>
          {correctNum} / {totalNum} correct • {accuracyNum}% accuracy
        </Text>

        {/* Answer grid */}
        {results.length > 0 && (
          <Text
            style={{ fontSize: 22, marginTop: 14, letterSpacing: 2 }}
            accessibilityLabel={`${correctNum} of ${totalNum} correct`}
          >
            {resultGrid(results)}
          </Text>
        )}

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
          <Text style={{ color: theme.colors.coin }}>
            {ranked ? 'Points Earned' : 'League XP'}
          </Text>
          <Text
            style={{
              fontSize: 36,
              fontWeight: '900',
              color: theme.colors.coin,
            }}
          >
            +{ranked ? pointsNum : xpNum}
          </Text>
          {ranked && xpNum > 0 && (
            <Text style={{ color: theme.colors.muted, fontSize: 12, marginTop: 4 }}>
              +{xpNum} league XP
            </Text>
          )}
          {!ranked && (
            <Text style={{ color: theme.colors.muted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
              Only Ranked runs count for the leaderboard.
            </Text>
          )}
          {Number(assisted) > 0 && (
            <Text style={{ color: theme.colors.muted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
              {Number(assisted)} answer{Number(assisted) > 1 ? 's' : ''} used a hint or extra time,
              so {Number(assisted) > 1 ? "they don't" : "it doesn't"} count toward the leaderboard.
            </Text>
          )}
          {capExceeded === 'true' && (
            <Text style={{ color: theme.colors.muted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
              Daily leaderboard limit reached — keep playing for fun, points resume tomorrow.
            </Text>
          )}
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
          {mode === 'daily' && (
            <TouchableOpacity
              onPress={() => router.replace('/daily')}
              accessibilityRole="button"
              style={{ backgroundColor: theme.colors.primary, paddingVertical: 16, borderRadius: 18, alignItems: 'center' }}
              hitSlop={8}
            >
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>
                📅 See today&apos;s standings
              </Text>
            </TouchableOpacity>
          )}
          {mode === 'duel' && duelCode && (
            <TouchableOpacity
              onPress={() => router.replace({ pathname: '/duel/[code]', params: { code: duelCode } })}
              accessibilityRole="button"
              style={{ backgroundColor: theme.colors.primary, paddingVertical: 16, borderRadius: 18, alignItems: 'center' }}
              hitSlop={8}
            >
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>
                🤝 View challenge
              </Text>
            </TouchableOpacity>
          )}

          {/* Start Another Quiz */}
          {(mode === 'classic' || mode === 'relaxed') && (
          <TouchableOpacity
            onPress={startAnotherQuiz}
            accessibilityLabel="Play another quiz"
            style={{
              backgroundColor: theme.colors.primary,
              paddingVertical: 16,
              borderRadius: 18,
              alignItems: 'center',
            }}
          
            accessibilityRole="button"
            hitSlop={8}>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>
              🔁 Start Another Quiz
            </Text>
          </TouchableOpacity>
          )}

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
          
            accessibilityRole="button"
            accessibilityLabel="Share Result"
            hitSlop={8}>
            <Share2 size={18} color={theme.colors.primary} />
            <Text
              style={{
                color: theme.colors.primary,
                fontWeight: '800',
                fontSize: 15,
              }}
            >
              {mode === 'duel' ? 'Send to a friend' : 'Share Result'}
            </Text>
          </TouchableOpacity>

          {/* Back to Home */}
          <TouchableOpacity
            onPress={goHome}
            accessibilityRole="button"
            accessibilityLabel="Back to home"
            style={{
              backgroundColor: theme.colors.surface,
              paddingVertical: 16,
              borderRadius: 18,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
            hitSlop={8}>
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
