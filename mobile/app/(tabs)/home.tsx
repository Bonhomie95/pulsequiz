import { useFocusEffect, useRouter } from 'expo-router';
import { Monitor, Moon, Sun, Coins, Flame } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AdBanner } from '@/src/ads/adBanner';
import { api } from '@/src/api/api';
import { HomeSkeleton } from '@/src/components/HomeSkeleton';
import { AVATAR_MAP } from '@/src/constants/avatars';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useCoinStore } from '@/src/store/useCoinStore';
import { useProgressStore } from '@/src/store/useProgressStore';
import { useStreakStore } from '@/src/store/useStreakStore';
import { useThemeStore } from '@/src/store/useThemeStore';
import { useTheme } from '@/src/theme/useTheme';
import { timeAgo } from '@/src/utils/timeAgo';
import { soundManager } from '@/src/audio/SoundManager';
import { useAudioStore } from '@/src/store/useAudioStore';
import { enterImmersiveMode, exitImmersiveMode } from '@/src/utils/immersive';

/* ---------------- HELPERS ---------------- */

function resolveAvatar(key?: string | null) {
  if (!key) return AVATAR_MAP.avatar0;
  return AVATAR_MAP[key as keyof typeof AVATAR_MAP] ?? AVATAR_MAP.avatar0;
}

/* ---------------- SCREEN ---------------- */

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();

  const { user } = useAuthStore();
  const { mode, setMode } = useThemeStore();
  const [loading, setLoading] = useState(true);
  const { coins } = useCoinStore();
  const { streak } = useStreakStore();

  const [lastCategory, setLastCategory] = useState<string | null>(null);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [lastPlayedAt, setLastPlayedAt] = useState<string | null>(null);

  /* ---------------- HYDRATION ---------------- */

  useEffect(() => {
    useCoinStore.getState().hydrate();
    useProgressStore.getState().hydrate();
    useStreakStore.getState().hydrate();
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);

      (async () => {
        try {
          const res = await api.get('/home/summary');
          if (!active) return;

          const { coins, streak, lastQuiz } = res.data;

          useCoinStore.getState().setCoins(coins);
          useStreakStore.getState().setStreak(streak);

          setLastCategory(lastQuiz?.category ?? null);
          setLastScore(
            typeof lastQuiz?.score === 'number' ? lastQuiz.score : null
          );
          setLastPlayedAt(lastQuiz?.playedAt ?? null);
        } catch (e) {
          console.warn('Home summary fetch failed', e);
        } finally {
          active && setLoading(false);
        }
      })();

      return () => {
        active = false;
      };
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      enterImmersiveMode();
      // return () => exitImmersiveMode();
    }, [])
  );

  useEffect(() => {
    soundManager.boot();
  }, []);
  useEffect(() => {
    // Boot audio + apply saved settings + start background immediately
    (async () => {
      const { muted, masterVolume, effectsVolume } = useAudioStore.getState();
      await soundManager.boot();
      soundManager.setMuted(muted);
      soundManager.setMasterVolume(masterVolume);
      soundManager.setEffectsVolume(effectsVolume);
      await soundManager.startBackground();
    })();
  }, []);

  /* ---------------- THEME ---------------- */

  const cycleTheme = () => {
    if (mode === 'system') setMode('dark');
    else if (mode === 'dark') setMode('light');
    else setMode('system');
  };

  const ThemeIcon = mode === 'system' ? Monitor : mode === 'dark' ? Moon : Sun;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.profile}>
            <Image source={resolveAvatar(user?.avatar)} style={styles.avatar} />
            <View>
              <Text style={[styles.username, { color: theme.colors.text }]}>
                {user?.username ?? 'Player'}
              </Text>
              <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                Welcome back
              </Text>
            </View>
          </View>

          <TouchableOpacity onPress={cycleTheme}>
            <ThemeIcon size={22} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        {/* WALLET CARD */}
        {loading ? (
          <HomeSkeleton />
        ) : (
          <View
            style={[styles.wallet, { backgroundColor: theme.colors.surface }]}
          >
            <TouchableOpacity
              style={styles.walletItem}
              onPress={() => router.push('/wallet')}
            >
              <Coins size={18} color={theme.colors.coin} />
              <Text style={[styles.walletValue, { color: theme.colors.coin }]}>
                {coins}
              </Text>
              <Text style={{ color: theme.colors.muted }}>Coins</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.walletItem}
              onPress={() => router.push('/streak')}
            >
              <Flame size={18} color={theme.colors.primary} />
              <Text
                style={[styles.walletValue, { color: theme.colors.primary }]}
              >
                {streak}
              </Text>
              <Text style={{ color: theme.colors.muted }}>Day Streak</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* QUICK STATS */}
        <View style={styles.stats}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Quick Stats
          </Text>

          <View
            style={[styles.statCard, { backgroundColor: theme.colors.surface }]}
          >
            <Text style={{ color: theme.colors.muted }}>Last Category</Text>
            <Text style={{ color: theme.colors.text, fontWeight: '600' }}>
              {lastCategory ?? '—'}
            </Text>
          </View>

          <View
            style={[styles.statCard, { backgroundColor: theme.colors.surface }]}
          >
            <Text style={{ color: theme.colors.muted }}>Last Score</Text>
            <Text style={{ color: theme.colors.text, fontWeight: '600' }}>
              {lastScore !== null ? lastScore : '—'}
            </Text>
            <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
              Played {timeAgo(lastPlayedAt)}
            </Text>
          </View>
        </View>

        {/* START QUIZ */}
        <TouchableOpacity
          onPress={() => router.push('/quiz/categories')}
          style={[styles.startQuiz, { backgroundColor: theme.colors.primary }]}
        >
          <Text style={styles.startText}>Start Quiz</Text>
        </TouchableOpacity>

        {/* EARN */}
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          Earn Rewards
        </Text>

        <TouchableOpacity
          style={[styles.earnCard, { backgroundColor: theme.colors.surface }]}
          onPress={() => router.push('/earn/ads')}
        >
          <Text style={{ color: theme.colors.text }}>
            Watch video → Earn coins
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.earnCard, { backgroundColor: theme.colors.surface }]}
          onPress={() => router.push('/streak')}
        >
          <Text style={{ color: theme.colors.text }}>
            Daily check-in → Keep streak alive
          </Text>
        </TouchableOpacity>
        {/* SMALL BANNER AD */}
        <View style={{ marginTop: 14, alignItems: 'center' }}>
          <View
            style={{
              width: '100%',
              maxWidth: 340,
              height: 52,
              borderRadius: 14,
              overflow: 'hidden',
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
              justifyContent: 'center',
            }}
          >
            <AdBanner />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 120,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  profile: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
  },
  wallet: {
    marginTop: 20,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 20,
  },
  walletItem: {
    alignItems: 'center',
  },
  walletValue: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 4,
  },
  stats: {
    marginTop: 28,
  },
  statCard: {
    padding: 16,
    borderRadius: 14,
    marginTop: 8,
  },
  startQuiz: {
    marginTop: 28,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  startText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  sectionTitle: {
    marginTop: 32,
    marginBottom: 12,
    fontSize: 16,
    fontWeight: '600',
  },
  earnCard: {
    padding: 18,
    borderRadius: 16,
    marginTop: 8,
  },
});
