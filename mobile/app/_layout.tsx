import { Redirect, Stack, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { storage } from '../src/utils/storage';
import { api, setAuthToken } from '../src/api/api';
import { useAuthStore } from '../src/store/useAuthStore';
import { startUsageAdTimer } from '@/src/ads/appUsageAd';

export default function RootLayout() {
  const segments = useSegments();
  const { user, hydrated, setUser, setHydrated } = useAuthStore();

  useEffect(() => {
    startUsageAdTimer();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const token = await storage.getToken();

        if (!token) {
          setHydrated();
          return;
        }

        setAuthToken(token);
        const r = await api.get('/auth/me');
        setUser(r.data.user);
      } catch {
        await storage.clearToken();
        setAuthToken(null);
      } finally {
        setHydrated();
      }
    })();
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const token = await storage.getToken();

        if (!token) {
          setHydrated();
          return;
        }

        setAuthToken(token);

        const r = await api.get('/auth/me');
        if (!mounted) return;

        setUser(r.data.user);
      } catch (e) {
        console.warn('Auth restore failed, clearing token', e);
        await storage.clearToken();
        setAuthToken(null);
      } finally {
        if (mounted) setHydrated();
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const inAuthGroup = segments[0] === '(auth)';
  const inTabsGroup = segments[0] === '(tabs)';
  const inQuizFlow = segments[0] === 'quiz';
  const inIdentity = segments[0] === '(auth)' && segments[1] === 'identity';

  const needsIdentity = !!user && (!user.username || !user.avatar);

  /** Not logged in → block tabs & quiz */
  if (!user && (inTabsGroup || inQuizFlow)) {
    return <Redirect href="/(auth)/login" />;
  }

  /** Logged in but missing identity → force identity */
  if (user && needsIdentity && !inIdentity) {
    return <Redirect href="/(auth)/identity" />;
  }

  /** Logged in → block auth pages EXCEPT identity */
  if (user && inAuthGroup && !inIdentity) {
    return <Redirect href="/(tabs)/home" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
