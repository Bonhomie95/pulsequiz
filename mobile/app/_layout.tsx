import { Redirect, Stack, useSegments } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

import { storage } from '../src/utils/storage';
import { api, setAuthToken } from '../src/api/api';
import { useAuthStore } from '../src/store/useAuthStore';
import { usePremiumStore } from '../src/store/usePremiumStore';
import { startUsageAdTimer } from '@/src/ads/appUsageAd';
import { STORAGE_KEYS } from '@/src/constants/storageKeys';

// ── Notification display behaviour while app is open ─────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ── Register device for Expo push notifications ───────────────────────────────
async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null; // simulators can't receive push

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  // Android requires an explicit notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'PulseQuiz',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6366F1',
    });
  }

  const { data } = await Notifications.getExpoPushTokenAsync();
  return data;
}

export default function RootLayout() {
  const segments = useSegments();
  const { user, hydrated, setUser, setHydrated } = useAuthStore();
  const { checkStatus: checkPremium } = usePremiumStore();
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  // Keep subscription refs so we can clean up on unmount
  const notifSubRef = useRef<any>(null);
  const notifRespRef = useRef<any>(null);

  useEffect(() => {
    startUsageAdTimer();
    AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING_DONE).then((val) => {
      setOnboardingDone(val === 'true');
    });
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
        checkPremium();

        // ── Register for push after auth restore ─────────────────────────
        const pushToken = await registerForPushNotifications();
        if (pushToken) {
          // Fire-and-forget; non-critical
          api
            .post('/push/register', {
              token: pushToken,
              platform: Platform.OS,
            })
            .catch(() => {});
        }
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

  // ── Notification listeners ─────────────────────────────────────────────────
  useEffect(() => {
    // Received while app is foregrounded (just display — handler above does it)
    notifSubRef.current = Notifications.addNotificationReceivedListener(
      (_notif) => {
        // Optional: update badge count, play a custom sound, etc.
      },
    );

    // User tapped a notification
    notifRespRef.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as any;
        // Deep-link based on notification type
        // Note: expo-router navigation isn't available here at mount time —
        // store the pending route and handle it once the app is fully loaded
        // if needed. For now, the app just opens to its last screen.
        console.log('[Push] Tapped notification:', data?.type);
      });

    return () => {
      notifSubRef.current?.remove();
      notifRespRef.current?.remove();
    };
  }, []);

  if (!hydrated || onboardingDone === null) {
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
  const inOnboarding = segments[0] === 'onboarding';

  const needsIdentity = !!user && (!user.username || !user.avatar);

  if (!user && (inTabsGroup || inQuizFlow))
    return <Redirect href="/(auth)/login" />;
  if (user && needsIdentity && !inIdentity)
    return <Redirect href="/(auth)/identity" />;
  if (user && !needsIdentity && !onboardingDone && !inOnboarding)
    return <Redirect href="/onboarding" />;
  if (user && inAuthGroup && !inIdentity)
    return <Redirect href="/(tabs)/home" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
