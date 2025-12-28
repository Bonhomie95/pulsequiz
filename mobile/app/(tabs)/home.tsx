import { useAuthStore } from '@/src/store/useAuthStore';
import { useCoinStore } from '@/src/store/useCoinStore';
import { useProgressStore } from '@/src/store/useProgressStore';
import { useStreakStore } from '@/src/store/useStreakStore';
import { useThemeStore } from '@/src/store/useThemeStore';
import { useTheme } from '@/src/theme/useTheme';
import { storage } from '@/src/utils/storage';
import { useRouter } from 'expo-router';
import { Monitor, Moon, Sun } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const router = useRouter();

const CATEGORIES = [
  { id: 'history', label: 'History', icon: '📜' },
  { id: 'math', label: 'Maths', icon: '➗' },
  { id: 'physics', label: 'Physics', icon: '⚛️' },
  { id: 'biology', label: 'Biology', icon: '🧬' },
  { id: 'chemistry', label: 'Chemistry', icon: '🧪' },
  { id: 'geography', label: 'Geography', icon: '🌍' },
];

export default function HomeScreen() {
  const theme = useTheme();
  const { user } = useAuthStore();
  const { mode, setMode } = useThemeStore();
  const { coins, addCoins } = useCoinStore();
  const level = 1; // mock for now
  const { streak, checkInToday } = useStreakStore();
  const [lastCategory, setLastCategory] = useState<string | null>(null);

  useEffect(() => {
    useCoinStore.getState().hydrate();
    useProgressStore.getState().hydrate();
    useStreakStore.getState().hydrate();
  }, []);

  useEffect(() => {
    storage.getLastCategory().then(setLastCategory);
  }, []);

  const cycleTheme = () => {
    if (mode === 'system') setMode('dark');
    else if (mode === 'dark') setMode('light');
    else setMode('system');
  };

  const ThemeIcon = mode === 'system' ? Monitor : mode === 'dark' ? Moon : Sun;

  function getAdReward(level: number) {
    if (level <= 2) return 50;
    if (level <= 5) return 60;
    if (level <= 9) return 70;
    return 100;
  }

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.profile}>
            <Image
              source={require('../../assets/avatars/avatar1.png')}
              style={styles.avatar}
            />
            <View>
              <Text style={[styles.username, { color: theme.colors.text }]}>
                {user?.username ?? 'Player'}
              </Text>
              <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                Level 1
              </Text>
            </View>
          </View>

          <TouchableOpacity onPress={cycleTheme}>
            <ThemeIcon size={22} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        {/* Coins */}
        <View
          style={[styles.coinsCard, { backgroundColor: theme.colors.surface }]}
        >
          <Text style={{ color: theme.colors.muted }}>Coins</Text>
          <Text
            style={{
              color: theme.colors.coin,
              fontSize: 28,
              fontWeight: '700',
            }}
          >
            250
          </Text>
        </View>

        {/* Start Quiz */}
        <TouchableOpacity
          style={[styles.startQuiz, { backgroundColor: theme.colors.primary }]}
        >
          <Text style={styles.startText}>Start Quiz</Text>
        </TouchableOpacity>

        {/* Categories */}
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          Categories
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingVertical: 12 }}
        >
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              activeOpacity={0.85}
              onPress={() => {
                router.push({
                  pathname: '/quiz',
                  params: { category: cat.id },
                });
              }}
              style={[
                styles.categoryCard,
                {
                  backgroundColor: theme.colors.surface,
                  shadowColor: theme.colors.primary,
                },
              ]}
            >
              {lastCategory === cat.id && (
                <View
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    backgroundColor: theme.colors.primary,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 10,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 10 }}>
                    Last Played
                  </Text>
                </View>
              )}

              {/* Icon */}
              <View
                style={[
                  styles.categoryIcon,
                  { backgroundColor: theme.colors.primary },
                ]}
              >
                <Text style={{ fontSize: 22 }}>{cat.icon}</Text>
              </View>

              {/* Label */}
              <Text
                style={{
                  color: theme.colors.text,
                  fontWeight: '600',
                  marginTop: 8,
                }}
              >
                {cat.label}
              </Text>

              {/* CTA hint */}
              <Text
                style={{
                  color: theme.colors.muted,
                  fontSize: 11,
                  marginTop: 2,
                }}
              >
                Tap to play
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Get Coins */}
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          Get Coins
        </Text>

        <TouchableOpacity
          style={[styles.getCoins, { backgroundColor: theme.colors.surface }]}
          onPress={() => {
            const reward = getAdReward(level);
            addCoins(reward);
            alert(`You earned ${reward} coins`);
          }}
        >
          <Text style={{ color: theme.colors.text }}>
            Watch Video → +{getAdReward(level)} coins
          </Text>
        </TouchableOpacity>
        {/* Daily Streak */}
        <TouchableOpacity
          style={[styles.getCoins, { backgroundColor: theme.colors.surface }]}
          onPress={() => {
            checkInToday();
            alert(`Daily check-in complete! Current streak: ${streak} days.`);
          }}
        >
          <Text style={{ color: theme.colors.text }}>
            Daily Check-In → Current Streak: {streak} days
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

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
  coinsCard: {
    marginTop: 20,
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  startQuiz: {
    marginTop: 24,
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
  getCoins: {
    padding: 20,
    borderRadius: 16,
    marginTop: 8,
  },
  categoryCard: {
    width: 120,
    height: 140,
    borderRadius: 20,
    marginRight: 14,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',

    // iOS shadow
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,

    // Android elevation
    elevation: 6,
  },

  categoryIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
