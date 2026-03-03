import { useRef, useState } from 'react';
import {
  Animated, Dimensions, FlatList, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/src/theme/useTheme';
import { STORAGE_KEYS } from '@/src/constants/storageKeys';

const { width: SCREEN_W } = Dimensions.get('window');

const SLIDES = [
  {
    key: 'play',
    emoji: '🧠',
    gradient: ['#5B7CFF', '#2EF2B3'],
    title: 'Quiz & Earn',
    subtitle: 'Answer questions across 11+ categories.\nEvery correct answer earns you points.',
    detail: 'Solo mode, PvP battles, or challenge friends in private rooms — you choose.',
  },
  {
    key: 'leaderboard',
    emoji: '🏆',
    gradient: ['#FFB800', '#FF6B35'],
    title: 'Climb the Ranks',
    subtitle: 'Weekly and monthly leaderboards reset every period.\nTop players earn real USDT prizes.',
    detail: 'The more you play, the higher you climb. Stay consistent to win big.',
  },
  {
    key: 'usdt',
    emoji: '💰',
    gradient: ['#2EF2B3', '#5B7CFF'],
    title: 'Real USDT Prizes',
    subtitle: 'Top-ranked players receive weekly payouts\ndirectly to their USDT wallet.',
    detail: 'Set up your TRC20, ERC20, or BEP20 wallet in Settings to unlock withdrawals.',
  },
  {
    key: 'payout',
    emoji: '📅',
    gradient: ['#7C3AED', '#5B7CFF'],
    title: 'Weekly Payouts',
    subtitle: 'Prize pools are distributed every Sunday.\nThe more players, the bigger the prize pool.',
    detail: 'Referral bonuses and watch-ad rewards boost your coin balance. Every coin counts!',
  },
];

export default function OnboardingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;

  const finish = async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING_DONE, 'true');
    router.replace('/(tabs)/home');
  };

  const next = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      finish();
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Slides */}
      <Animated.FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={(s) => s.key}
        horizontal
        pagingEnabled
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
          setCurrentIndex(idx);
        }}
        renderItem={({ item: slide }) => (
          <View style={[styles.slide, { width: SCREEN_W }]}>
            {/* Gradient circle */}
            <LinearGradient
              colors={slide.gradient as [string, string]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.emojiCircle}
            >
              <Text style={styles.emoji}>{slide.emoji}</Text>
            </LinearGradient>

            <Text style={[styles.slideTitle, { color: theme.colors.text }]}>{slide.title}</Text>
            <Text style={[styles.slideSubtitle, { color: theme.colors.muted }]}>{slide.subtitle}</Text>
            <View style={[styles.detailCard, { backgroundColor: theme.colors.surface }]}>
              <Text style={[styles.detailText, { color: theme.colors.text }]}>{slide.detail}</Text>
            </View>
          </View>
        )}
      />

      {/* Dots + buttons */}
      <View style={styles.footer}>
        {/* Dot indicators */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => {
            const inputRange = [(i - 1) * SCREEN_W, i * SCREEN_W, (i + 1) * SCREEN_W];
            const width = scrollX.interpolate({ inputRange, outputRange: [8, 24, 8], extrapolate: 'clamp' });
            const opacity = scrollX.interpolate({ inputRange, outputRange: [0.4, 1, 0.4], extrapolate: 'clamp' });
            return (
              <Animated.View
                key={i}
                style={[styles.dot, { width, opacity, backgroundColor: theme.colors.primary }]}
              />
            );
          })}
        </View>

        {/* Next / Get Started button */}
        <TouchableOpacity onPress={next} style={styles.nextBtnWrap}>
          <LinearGradient
            colors={[theme.colors.primary, theme.colors.secondary]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.nextBtn}
          >
            <Text style={styles.nextBtnText}>
              {currentIndex < SLIDES.length - 1 ? 'Next →' : '🚀 Let\'s Play!'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Skip */}
        {currentIndex < SLIDES.length - 1 && (
          <TouchableOpacity onPress={finish} style={{ paddingVertical: 12 }}>
            <Text style={[styles.skipText, { color: theme.colors.muted }]}>Skip for now</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 40,
  },
  emojiCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 36,
    shadowColor: '#5B7CFF',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  emoji: { fontSize: 64 },
  slideTitle: { fontSize: 30, fontWeight: '900', textAlign: 'center', marginBottom: 14 },
  slideSubtitle: { fontSize: 15, textAlign: 'center', lineHeight: 24, marginBottom: 24 },
  detailCard: {
    width: '100%', borderRadius: 20, padding: 18,
  },
  detailText: { fontSize: 14, lineHeight: 22, textAlign: 'center' },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 20,
    alignItems: 'center',
    gap: 14,
  },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { height: 8, borderRadius: 4 },
  nextBtnWrap: { width: '100%', borderRadius: 20, overflow: 'hidden' },
  nextBtn: { paddingVertical: 18, alignItems: 'center' },
  nextBtnText: { color: '#fff', fontSize: 17, fontWeight: '900' },
  skipText: { fontSize: 14, fontWeight: '600' },
});
