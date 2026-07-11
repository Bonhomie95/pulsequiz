import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Monitor, Moon, Sun } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';

import { api, setAuthToken } from '../../src/api/api';
import { useAuthStore } from '../../src/store/useAuthStore';
import { storage } from '../../src/utils/storage';
import { useThemeStore } from '../../src/store/useThemeStore';
import { useTheme } from '../../src/theme/useTheme';

import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';

WebBrowser.maybeCompleteAuthSession();

const { width, height } = Dimensions.get('window');

const facebookDiscovery = {
  authorizationEndpoint: 'https://www.facebook.com/v19.0/dialog/oauth',
};

function bootstrapGoogleSignin() {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (!webClientId) {
    console.warn(
      'Missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in env. Google Sign-In will fail.',
    );
    return;
  }
  if (Platform.OS === 'ios' && !iosClientId) {
    console.warn(
      'Missing EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID in env. Google Sign-In will fail on iOS.',
    );
  }
  GoogleSignin.configure({
    webClientId,
    // iOS needs its own client ID (no GoogleService-Info.plist in this project)
    ...(iosClientId ? { iosClientId } : {}),
    offlineAccess: true,
    forceCodeForRefreshToken: true,
  });
}

// ── Floating particle ─────────────────────────────────────────────────────────

function FloatingParticle({
  x,
  y,
  size,
  delay,
  color,
}: {
  x: number;
  y: number;
  size: number;
  delay: number;
  color: string;
}) {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.6, { duration: 800 }),
          withTiming(0.15, { duration: 800 }),
        ),
        -1,
        true,
      ),
    );
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-18, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      ),
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: x,
          top: y,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const router = useRouter();
  const theme = useTheme();
  const isDark = theme.colors.background === '#0B0F1A';
  const { mode, setMode } = useThemeStore();
  const setUser = useAuthStore((s) => s.setUser);

  const [loading, setLoading] = useState(false);
  const [activeBtn, setActiveBtn] = useState<'google' | 'fb' | null>(null);

  // Entrance animations
  const heroOpacity = useSharedValue(0);
  const heroY = useSharedValue(30);
  const cardOpacity = useSharedValue(0);
  const cardY = useSharedValue(40);
  const btnsOpacity = useSharedValue(0);
  const btnsY = useSharedValue(30);

  useEffect(() => {
    bootstrapGoogleSignin();

    heroOpacity.value = withTiming(1, { duration: 550 });
    heroY.value = withTiming(0, {
      duration: 550,
      easing: Easing.out(Easing.cubic),
    });

    cardOpacity.value = withDelay(180, withTiming(1, { duration: 500 }));
    cardY.value = withDelay(
      180,
      withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) }),
    );

    btnsOpacity.value = withDelay(340, withTiming(1, { duration: 500 }));
    btnsY.value = withDelay(
      340,
      withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) }),
    );
  }, []);

  const heroStyle = useAnimatedStyle(() => ({
    opacity: heroOpacity.value,
    transform: [{ translateY: heroY.value }],
  }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardY.value }],
  }));
  const btnsStyle = useAnimatedStyle(() => ({
    opacity: btnsOpacity.value,
    transform: [{ translateY: btnsY.value }],
  }));

  // Particles config
  const particles = useMemo(
    () => [
      {
        x: width * 0.08,
        y: height * 0.18,
        size: 6,
        delay: 0,
        color: '#5B7CFF66',
      },
      {
        x: width * 0.85,
        y: height * 0.12,
        size: 4,
        delay: 300,
        color: '#2EF2B366',
      },
      {
        x: width * 0.72,
        y: height * 0.35,
        size: 8,
        delay: 600,
        color: '#5B7CFF44',
      },
      {
        x: width * 0.15,
        y: height * 0.55,
        size: 5,
        delay: 900,
        color: '#2EF2B344',
      },
      {
        x: width * 0.9,
        y: height * 0.62,
        size: 6,
        delay: 200,
        color: '#FFC94A55',
      },
      {
        x: width * 0.05,
        y: height * 0.78,
        size: 4,
        delay: 750,
        color: '#5B7CFF44',
      },
      {
        x: width * 0.78,
        y: height * 0.82,
        size: 7,
        delay: 450,
        color: '#2EF2B333',
      },
    ],
    [],
  );

  const ThemeIcon = useMemo(
    () => (mode === 'system' ? Monitor : mode === 'dark' ? Moon : Sun),
    [mode],
  );

  const cycleTheme = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (mode === 'system') setMode('dark');
    else if (mode === 'dark') setMode('light');
    else setMode('system');
  };

  // ── Google Sign-In ─────────────────────────────────────────────────────────
  const signInWithGoogle = async () => {
    if (loading) return;
    setLoading(true);
    setActiveBtn('google');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices({
          showPlayServicesUpdateDialog: true,
        });
      }
      try {
        await GoogleSignin.signOut();
      } catch {}

      await GoogleSignin.signIn();
      const { idToken } = await GoogleSignin.getTokens();

      if (!idToken) {
        Alert.alert('Login failed', 'No Google ID token returned');
        return;
      }

      const r = await api.post('/auth/oauth', {
        provider: 'google',
        token: idToken,
      });
      const { token, user, needsIdentity } = r.data || {};

      if (!token || !user) {
        Alert.alert('Login failed', 'Invalid server response. Try again.');
        return;
      }

      await storage.setToken(token);
      setAuthToken(token);
      setUser({
        id: user.id,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (needsIdentity) router.replace('/(auth)/identity');
      else router.replace('/(tabs)/home');
    } catch (e: any) {
      const code = e?.code;
      if (code === statusCodes.SIGN_IN_CANCELLED) {
        // silent
      } else if (code === statusCodes.IN_PROGRESS) {
        Alert.alert('Please wait', 'Sign-in already in progress.');
      } else if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert('Google Play Services', 'Needs an update.');
      } else {
        Alert.alert(
          'Login failed',
          e?.response?.data?.message || e?.message || 'Google Sign-In failed.',
        );
      }
    } finally {
      setLoading(false);
      setActiveBtn(null);
    }
  };

  // ── Facebook Sign-In ───────────────────────────────────────────────────────
  const signInWithFacebook = async () => {
    if (loading) return;
    setLoading(true);
    setActiveBtn('fb');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const clientId = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID;
      if (!clientId) {
        Alert.alert('Configuration error', 'Missing Facebook App ID');
        return;
      }

      const redirectUri = AuthSession.makeRedirectUri();
      const request = new AuthSession.AuthRequest({
        clientId,
        scopes: ['public_profile', 'email'],
        redirectUri,
        responseType: AuthSession.ResponseType.Token,
      });
      const result = await request.promptAsync(facebookDiscovery);
      if (result.type !== 'success' || !result.params.access_token) return;

      const r = await api.post('/auth/oauth', {
        provider: 'facebook',
        token: result.params.access_token,
      });
      const { token, user, needsIdentity } = r.data || {};

      if (!token || !user) {
        Alert.alert('Login failed', 'Invalid server response');
        return;
      }

      await storage.setToken(token);
      setAuthToken(token);
      setUser({
        id: user.id,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (needsIdentity) router.replace('/(auth)/identity');
      else router.replace('/(tabs)/home');
    } catch (e: any) {
      Alert.alert(
        'Facebook Login failed',
        e?.response?.data?.message || e?.message || 'Try again',
      );
    } finally {
      setLoading(false);
      setActiveBtn(null);
    }
  };

  const bg: [string, string, string] = isDark
    ? ['#070B14', '#0B0F1A', '#0D1528']
    : ['#F0F4FF', '#FFFFFF', '#EEF2FF'];

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={bg} style={StyleSheet.absoluteFill} />

      {/* Floating particles */}
      {particles.map((p, i) => (
        <FloatingParticle key={i} {...p} />
      ))}

      {/* Decorative orbs */}
      <View
        style={[
          styles.orb,
          styles.orbTR,
          isDark ? styles.orbTRDark : styles.orbTRLight,
        ]}
      />
      <View
        style={[
          styles.orb,
          styles.orbBL,
          isDark ? styles.orbBLDark : styles.orbBLLight,
        ]}
      />

      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        {/* Theme toggle */}
        <TouchableOpacity
          style={[
            styles.themeBtn,
            { backgroundColor: isDark ? '#131A2E' : '#F4F6FB' },
          ]}
          onPress={cycleTheme}
        >
          <ThemeIcon size={18} color={isDark ? '#A6B0CF' : '#6B7280'} />
        </TouchableOpacity>

        {/* Hero */}
        <Animated.View style={[styles.hero, heroStyle]}>
          {/* Icon */}
          <View style={styles.iconWrap}>
            <LinearGradient
              colors={['#7B9FFF', '#5B7CFF', '#3A5BE8']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconBox}
            >
              <Text style={styles.iconEmoji}>⚡</Text>
            </LinearGradient>
            {/* Glow */}
            <View style={[styles.iconGlow, { shadowColor: '#5B7CFF' }]} />
          </View>

          <Text
            style={[styles.appName, { color: isDark ? '#FFFFFF' : '#0B0F1A' }]}
          >
            PulseQuiz
          </Text>
          <Text
            style={[styles.tagline, { color: isDark ? '#A6B0CF' : '#6B7280' }]}
          >
            Think fast. Win smarter.
          </Text>

          {/* Feature pills */}
          <Animated.View style={[styles.pills, cardStyle]}>
            {['🏆 Real USDT prizes', '⚡ Live PvP', '🔥 Daily streaks'].map(
              (label) => (
                <View
                  key={label}
                  style={[
                    styles.pill,
                    {
                      backgroundColor: isDark ? '#131A2E' : '#EEF2FF',
                      borderColor: isDark ? '#1F2937' : '#C7D2FE',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.pillText,
                      { color: isDark ? '#A6B0CF' : '#4B5563' },
                    ]}
                  >
                    {label}
                  </Text>
                </View>
              ),
            )}
          </Animated.View>
        </Animated.View>

        {/* Auth card */}
        <Animated.View
          style={[
            styles.card,
            btnsStyle,
            {
              backgroundColor: isDark ? '#0F1423' : '#FFFFFF',
              borderColor: isDark ? '#1F2937' : '#E5E7EB',
            },
          ]}
        >
          <Text
            style={[
              styles.cardTitle,
              { color: isDark ? '#FFFFFF' : '#0B0F1A' },
            ]}
          >
            Sign in to play
          </Text>
          <Text
            style={[styles.cardSub, { color: isDark ? '#A6B0CF' : '#6B7280' }]}
          >
            Join thousands competing for weekly prizes
          </Text>

          <View style={styles.btnStack}>
            <LoginButton
              label="Continue with Google"
              icon="🔵"
              onPress={signInWithGoogle}
              loading={activeBtn === 'google'}
              disabled={loading}
              isDark={isDark}
              variant="primary"
            />
            <LoginButton
              label="Continue with Facebook"
              icon="🔷"
              onPress={signInWithFacebook}
              loading={activeBtn === 'fb'}
              disabled={loading}
              isDark={isDark}
              variant="ghost"
            />
          </View>

          <Text
            style={[styles.terms, { color: isDark ? '#2A3350' : '#9CA3AF' }]}
          >
            By continuing you agree to our{' '}
            <Text style={{ color: '#5B7CFF' }}>Terms</Text>
            {' & '}
            <Text style={{ color: '#5B7CFF' }}>Privacy Policy</Text>
          </Text>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

// ── LoginButton ───────────────────────────────────────────────────────────────

function LoginButton({
  label,
  icon,
  onPress,
  loading,
  disabled,
  isDark,
  variant,
}: {
  label: string;
  icon: string;
  onPress: () => void;
  loading: boolean;
  disabled: boolean;
  isDark: boolean;
  variant: 'primary' | 'ghost';
}) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.96, { damping: 15 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15 });
  };

  const isPrimary = variant === 'primary';

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        style={({ pressed }) => [
          styles.loginBtn,
          isPrimary
            ? { backgroundColor: '#5B7CFF' }
            : {
                backgroundColor: 'transparent',
                borderWidth: 1.5,
                borderColor: isDark ? '#1F2937' : '#E5E7EB',
              },
          (disabled || pressed) && { opacity: 0.72 },
        ]}
      >
        {loading ? (
          <LoadingDots isDark={isDark} isPrimary={isPrimary} />
        ) : (
          <>
            <Text style={styles.btnIcon}>{icon}</Text>
            <Text
              style={[
                styles.btnLabel,
                {
                  color: isPrimary ? '#FFFFFF' : isDark ? '#A6B0CF' : '#374151',
                },
              ]}
            >
              {label}
            </Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ── Loading dots ──────────────────────────────────────────────────────────────

// Single animated dot — hooks must live in a component, never in a .map() callback
function SingleDot({ delay, color }: { delay: number; color: string }) {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 280, easing: Easing.out(Easing.quad) }),
          withTiming(0.6, { duration: 280 }),
        ),
        -1,
        false,
      ),
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 280 }),
          withTiming(0.3, { duration: 280 }),
        ),
        -1,
        false,
      ),
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
    backgroundColor: color,
  }));

  return <Animated.View style={[styles.dot, style]} />;
}

function LoadingDots({
  isDark,
  isPrimary,
}: {
  isDark: boolean;
  isPrimary: boolean;
}) {
  const dotColor = isPrimary ? '#ffffff' : '#5B7CFF';
  return (
    <View style={styles.dotsRow}>
      <SingleDot delay={0} color={dotColor} />
      <SingleDot delay={160} color={dotColor} />
      <SingleDot delay={320} color={dotColor} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // BG orbs
  orb: { position: 'absolute', borderRadius: 999 },
  orbTR: { width: 280, height: 280, top: -80, right: -60 },
  orbBL: { width: 220, height: 220, bottom: -50, left: -60 },
  orbTRDark: { backgroundColor: '#5B7CFF', opacity: 0.06 },
  orbTRLight: { backgroundColor: '#5B7CFF', opacity: 0.1 },
  orbBLDark: { backgroundColor: '#2EF2B3', opacity: 0.05 },
  orbBLLight: { backgroundColor: '#2EF2B3', opacity: 0.08 },

  // Theme btn
  themeBtn: {
    position: 'absolute',
    top: 14,
    right: 18,
    zIndex: 20,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },

  // Hero
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
  },

  iconWrap: { position: 'relative', marginBottom: 22 },
  iconBox: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#5B7CFF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 14,
  },
  iconEmoji: { fontSize: 40 },
  iconGlow: {
    position: 'absolute',
    inset: -10,
    borderRadius: 40,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 28,
    elevation: 0,
  },

  appName: {
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -0.8,
    marginBottom: 6,
  },
  tagline: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 24,
    letterSpacing: 0.2,
  },

  pills: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillText: { fontSize: 12, fontWeight: '600' },

  // Card
  card: {
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 28,
    borderWidth: 1,
    padding: 24,
    paddingBottom: 20,
    gap: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  cardSub: {
    fontSize: 13,
    fontWeight: '400',
    marginBottom: 20,
  },

  btnStack: { gap: 12, marginBottom: 16 },

  loginBtn: {
    height: 54,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  btnIcon: { fontSize: 18 },
  btnLabel: { fontSize: 15, fontWeight: '700' },

  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  terms: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
});
