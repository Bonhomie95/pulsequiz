import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { api, setAuthToken } from '@/src/api/api';
import { connectSocket } from '@/src/socket/connect';
import { storage } from '@/src/utils/storage';
import { useAuthStore } from '@/src/store/useAuthStore';

/**
 * Sign in with a token handed over on a deep link. Development builds only.
 *
 * Sign-in is Apple/Google OAuth, which cannot be driven from a simulator
 * without a person typing real credentials — so nobody could test 1v1 end to
 * end, which needs two signed-in accounts at once. This takes a session token
 * minted against the database and stores it like a normal sign-in:
 *
 *   xcrun simctl openurl <udid> \
 *     'com.bonhomie95.pulsequiz://(auth)/dev-login?token=<jwt>'
 *
 * `__DEV__` is a compile-time constant, so a release build renders the refusal
 * below and nothing else — there is no path from here to a session in
 * production. It still needs a valid server-signed token; it cannot mint one.
 */
export default function DevLogin() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!__DEV__ || !token) return;
    (async () => {
      try {
        await storage.setSession(token);
        // Storing it is not enough: there is deliberately no async request
        // interceptor, so the header has to be set explicitly or the next
        // call still carries whatever was there before.
        setAuthToken(token);
        const me: any = await api.get('/auth/me');
        useAuthStore.getState().setUser(me.data.user);
        connectSocket();
        router.replace('/(tabs)/home');
      } catch (err: any) {
        setError(String(err?.message ?? err));
      }
    })();
  }, [token, router]);

  if (!__DEV__) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>Not available.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <ActivityIndicator />
      <Text>{error ?? (token ? 'Signing in…' : 'No token supplied')}</Text>
    </View>
  );
}
