import { useEffect, useRef } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const { width } = Dimensions.get('window');
const BAR_WIDTH = width * 0.65;

// Fake progress tips that rotate while loading
const TIPS = [
  'Loading your stats…',
  'Syncing leaderboard…',
  'Warming up the quiz engine…',
  'Checking your streak…',
  'Almost ready…',
];

export default function SplashLoader() {
  const tipIndex = useRef(0);

  // Logo entrance
  const logoScale   = useSharedValue(0.6);
  const logoOpacity = useSharedValue(0);

  // Tagline fade
  const tagOpacity = useSharedValue(0);
  const tagY       = useSharedValue(12);

  // Progress bar
  const barProgress = useSharedValue(0);

  // Tip text
  const tipOpacity = useSharedValue(0);
  const tipY       = useSharedValue(6);
  const tipText    = useSharedValue(TIPS[0]);

  // Pulse glow behind logo
  const glowScale   = useSharedValue(1);
  const glowOpacity = useSharedValue(0.35);

  useEffect(() => {
    // Logo pop-in
    logoScale.value   = withTiming(1,   { duration: 600, easing: Easing.out(Easing.back(1.4)) });
    logoOpacity.value = withTiming(1,   { duration: 400 });

    // Tagline slides up after logo
    tagOpacity.value = withDelay(400, withTiming(1,  { duration: 400 }));
    tagY.value       = withDelay(400, withTiming(0,  { duration: 400, easing: Easing.out(Easing.quad) }));

    // Tip text fade in
    tipOpacity.value = withDelay(700, withTiming(1, { duration: 350 }));
    tipY.value       = withDelay(700, withTiming(0, { duration: 350 }));

    // Progress bar — fake fill over ~3.5s (covers typical auth restore time)
    barProgress.value = withDelay(
      600,
      withSequence(
        withTiming(0.55, { duration: 1200, easing: Easing.out(Easing.quad) }),
        withTiming(0.78, { duration: 900,  easing: Easing.inOut(Easing.quad) }),
        withTiming(0.93, { duration: 1400, easing: Easing.out(Easing.quad) }),
        // Hold at 93% — actual completion is handled by parent unmounting this
        withRepeat(withTiming(0.93, { duration: 800 }), -1, false)
      )
    );

    // Glow pulse
    glowScale.value   = withRepeat(withSequence(
      withTiming(1.25, { duration: 1800, easing: Easing.inOut(Easing.sine) }),
      withTiming(1,    { duration: 1800, easing: Easing.inOut(Easing.sine) }),
    ), -1, false);
    glowOpacity.value = withRepeat(withSequence(
      withTiming(0.55, { duration: 1800 }),
      withTiming(0.25, { duration: 1800 }),
    ), -1, false);

    // Rotate tips every 1.4 s
    const iv = setInterval(() => {
      tipIndex.current = (tipIndex.current + 1) % TIPS.length;
      // Fade out, swap, fade in
      tipOpacity.value = withSequence(
        withTiming(0,   { duration: 180 }),
        withTiming(1,   { duration: 220, easing: Easing.out(Easing.quad) }),
      );
    }, 1400);

    return () => clearInterval(iv);
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
    opacity: logoOpacity.value,
  }));

  const tagStyle = useAnimatedStyle(() => ({
    opacity: tagOpacity.value,
    transform: [{ translateY: tagY.value }],
  }));

  const barStyle = useAnimatedStyle(() => ({
    width: BAR_WIDTH * barProgress.value,
  }));

  const tipStyle = useAnimatedStyle(() => ({
    opacity: tipOpacity.value,
    transform: [{ translateY: tipY.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
    opacity: glowOpacity.value,
  }));

  return (
    <LinearGradient
      colors={['#070B14', '#0B0F1A', '#0D1426']}
      style={styles.root}
    >
      {/* Decorative background orbs */}
      <View style={[styles.orb, styles.orbTopRight]} />
      <View style={[styles.orb, styles.orbBottomLeft]} />

      <View style={styles.center}>
        {/* Glow ring behind logo */}
        <Animated.View style={[styles.glow, glowStyle]} />

        {/* Logo */}
        <Animated.View style={[styles.logoWrap, logoStyle]}>
          <LinearGradient
            colors={['#7B9FFF', '#5B7CFF', '#3A5BE8']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.logoBox}
          >
            <Text style={styles.logoEmoji}>⚡</Text>
          </LinearGradient>
        </Animated.View>

        {/* App name */}
        <Animated.View style={logoStyle}>
          <Text style={styles.appName}>PulseQuiz</Text>
        </Animated.View>

        {/* Tagline */}
        <Animated.View style={tagStyle}>
          <Text style={styles.tagline}>Think fast. Win smarter.</Text>
        </Animated.View>

        {/* Progress bar */}
        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, barStyle]}>
            <LinearGradient
              colors={['#5B7CFF', '#2EF2B3']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            {/* Shimmer overlay */}
            <View style={styles.barShimmer} />
          </Animated.View>
        </View>

        {/* Tip text */}
        <Animated.View style={tipStyle}>
          <TipText tipIndex={tipIndex} />
        </Animated.View>
      </View>

      {/* Version at bottom */}
      <Text style={styles.version}>v1.0.0</Text>
    </LinearGradient>
  );
}

// Separate component so it can read the latest tipIndex ref value on each render
function TipText({ tipIndex }: { tipIndex: React.MutableRefObject<number> }) {
  return (
    <Text style={styles.tip}>{TIPS[tipIndex.current]}</Text>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Background orbs
  orb: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.07,
  },
  orbTopRight: {
    width: 300, height: 300,
    backgroundColor: '#5B7CFF',
    top: -80, right: -80,
  },
  orbBottomLeft: {
    width: 240, height: 240,
    backgroundColor: '#2EF2B3',
    bottom: -60, left: -60,
  },

  center: {
    alignItems: 'center',
    gap: 0,
  },

  // Glow
  glow: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#5B7CFF',
    top: -14,
  },

  // Logo
  logoWrap: {
    marginBottom: 20,
    shadowColor: '#5B7CFF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7,
    shadowRadius: 24,
    elevation: 16,
  },
  logoBox: {
    width: 88,
    height: 88,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoEmoji: {
    fontSize: 44,
  },

  appName: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 8,
  },

  tagline: {
    fontSize: 14,
    color: '#A6B0CF',
    fontWeight: '500',
    marginBottom: 48,
    letterSpacing: 0.3,
  },

  // Progress bar
  barTrack: {
    width: BAR_WIDTH,
    height: 5,
    backgroundColor: '#1F2937',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 16,
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barShimmer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 24,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 3,
  },

  tip: {
    fontSize: 12,
    color: '#5B7CFF',
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  version: {
    position: 'absolute',
    bottom: 36,
    fontSize: 11,
    color: '#2A3350',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
