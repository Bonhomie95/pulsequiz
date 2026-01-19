import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Monitor, Moon, Sun } from 'lucide-react-native';

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

const facebookDiscovery = {
  authorizationEndpoint: 'https://www.facebook.com/v19.0/dialog/oauth',
};

/**
 * ✅ BOOTSTRAP (in-file, as requested)
 * - Configures Google Sign-In once.
 * - Uses Web Client ID because it enables idToken retrieval for backend verification.
 */
function bootstrapGoogleSignin() {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

  if (!webClientId) {
    // This is the #1 silent failure cause. Make it loud.
    console.warn(
      'Missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in env. Google Sign-In will fail.'
    );
    return;
  }

  GoogleSignin.configure({
    webClientId,
    offlineAccess: true,
    forceCodeForRefreshToken: true,
  });
}

export default function LoginScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { mode, setMode } = useThemeStore();
  const setUser = useAuthStore((s) => s.setUser);

  const [loading, setLoading] = useState(false);

  // ✅ Bootstrap once on mount
  useEffect(() => {
    bootstrapGoogleSignin();
  }, []);

  const ThemeIcon = useMemo(
    () => (mode === 'system' ? Monitor : mode === 'dark' ? Moon : Sun),
    [mode]
  );

  const cycleTheme = () => {
    if (mode === 'system') setMode('dark');
    else if (mode === 'dark') setMode('light');
    else setMode('system');
  };

  const signInWithGoogle = async () => {
    if (loading) return;
    setLoading(true);

    try {
      // ✅ Ensure Play Services (Android)
      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices({
          showPlayServicesUpdateDialog: true,
        });
      }

      // ✅ Sometimes stale sessions cause weird behavior; ensure clean start
      // (safe even if already signed out)
      try {
        await GoogleSignin.signOut();
      } catch {}

      await GoogleSignin.signIn();

      const { idToken } = await GoogleSignin.getTokens();

      if (!idToken) {
        Alert.alert('Login failed', 'No Google ID token returned');
        return;
      }

      // ✅ Exchange Google idToken with your API (server verifies with Google)
      const r = await api.post('/auth/oauth', {
        provider: 'google',
        token: idToken,
      });

      const { token, user, needsIdentity } = r.data || {};

      if (!token || !user) {
        Alert.alert('Login failed', 'Invalid server response. Try again.');
        setLoading(false);
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

      if (needsIdentity) {
        router.replace('/(auth)/identity');
      } else {
        router.replace('/(tabs)/home');
      }
    } catch (e: any) {
      // ✅ Friendly, accurate error handling
      const code = e?.code;

      if (code === statusCodes.SIGN_IN_CANCELLED) {
        // user cancelled - no alert needed
      } else if (code === statusCodes.IN_PROGRESS) {
        Alert.alert('Please wait', 'Sign-in already in progress.');
      } else if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert(
          'Google Play Services',
          'Google Play Services is not available or needs an update.'
        );
      } else {
        const msg =
          e?.response?.data?.message ||
          e?.message ||
          'Google Sign-In failed. Check your configuration.';
        Alert.alert('Login failed', msg);
      }
      console.log('Google Sign-In error:', e);
    } finally {
      setLoading(false);
    }
  };

  const signInWithFacebook = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const clientId = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID;

      if (!clientId) {
        Alert.alert('Configuration error', 'Missing Facebook App ID');
        return;
      }

      const redirectUri = AuthSession.makeRedirectUri({
        // useProxy: true, // important for Expo Go
      });

      const request = new AuthSession.AuthRequest({
        clientId,
        scopes: ['public_profile', 'email'],
        redirectUri,
        responseType: AuthSession.ResponseType.Token,
      });

      const result = await request.promptAsync(facebookDiscovery);

      if (result.type !== 'success' || !result.params.access_token) {
        return;
      }

      const accessToken = result.params.access_token;

      // Exchange FB access token with backend
      const r = await api.post('/auth/oauth', {
        provider: 'facebook',
        token: accessToken,
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

      if (needsIdentity) {
        router.replace('/(auth)/identity');
      } else {
        router.replace('/(tabs)/home');
      }
    } catch (e: any) {
      Alert.alert(
        'Facebook Login failed',
        e?.response?.data?.message || e?.message || 'Try again'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.safe, { backgroundColor: theme.colors.background }]}
    >
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        {/* Theme Toggle */}
        <TouchableOpacity
          style={[
            styles.themeToggle,
            { backgroundColor: theme.colors.surface },
          ]}
          onPress={cycleTheme}
          activeOpacity={0.85}
        >
          <ThemeIcon size={20} color={theme.colors.text} />
        </TouchableOpacity>

        {/* Logo / Title */}
        <View style={styles.center}>
          <Text style={[styles.logo, { color: theme.colors.text }]}>
            Pulse Quiz
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.muted }]}>
            Think fast. Win smarter.
          </Text>
        </View>

        {/* Auth Buttons */}
        <View style={styles.actions}>
          <AuthButton
            label={loading ? 'Signing in…' : 'Continue with Google'}
            onPress={signInWithGoogle}
            disabled={loading}
          />

          {/* Placeholder */}
          <AuthButton
            label="Continue with Facebook"
            onPress={signInWithFacebook}
            disabled={loading}
            variant="ghost"
          />

          {loading ? (
            <View style={styles.loaderRow}>
              <ActivityIndicator />
              <Text style={[styles.loaderText, { color: theme.colors.muted }]}>
                Please wait…
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

function AuthButton({
  label,
  onPress,
  disabled,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
}) {
  const theme = useTheme();
  const isGhost = variant === 'ghost';

  return (
    <TouchableOpacity
      style={[
        styles.authBtn,
        isGhost
          ? {
              backgroundColor: 'transparent',
              borderWidth: 1,
              borderColor: theme.colors.muted,
            }
          : { backgroundColor: theme.colors.primary ?? '#5B7CFF' },
        disabled ? { opacity: 0.6 } : null,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
    >
      <Text
        style={[
          styles.authText,
          isGhost ? { color: theme.colors.text } : { color: '#fff' },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },

  themeToggle: {
    position: 'absolute',
    top: 18,
    right: 18,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    // subtle shadow
    elevation: 2,
  },

  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
  },
  logo: {
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  subtitle: {
    marginTop: 10,
    fontSize: 14,
  },

  actions: {
    paddingBottom: 40,
    gap: 14,
  },

  authBtn: {
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authText: {
    fontSize: 16,
    fontWeight: '700',
  },

  loaderRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
  },
  loaderText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
