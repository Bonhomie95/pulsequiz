import { Redirect, Stack, useRouter, useSegments } from 'expo-router';
import type { Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

import { storage } from '../src/utils/storage';
import { api, setAuthToken } from '../src/api/api';
import { useAuthStore } from '../src/store/useAuthStore';
import { usePremiumStore } from '../src/store/usePremiumStore';
import { useOnboardingStore } from '../src/store/useOnboardingStore';
import { startUsageAdTimer } from '@/src/ads/appUsageAd';
import { notificationRouteFor } from '@/src/utils/notificationRoutes';
import SplashLoader from '@/src/components/SplashLoader';

// ── Notification display behaviour while app is open ─────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
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
  const router = useRouter();
  const { user, hydrated, setUser, setHydrated } = useAuthStore();
  const { checkStatus: checkPremium } = usePremiumStore();
  const { done: onboardingDone, hydrate: hydrateOnboarding } =
    useOnboardingStore();

  // A route parsed from a tapped notification that we couldn't navigate to yet
  // (app still hydrating auth, or user not logged in). Applied once ready.
  const [pendingRoute, setPendingRoute] = useState<Href | null>(null);

  // Keep subscription refs so we can clean up on unmount
  const notifSubRef = useRef<any>(null);
  const notifRespRef = useRef<any>(null);

  useEffect(() => {
    startUsageAdTimer();
    hydrateOnboarding();
  }, [hydrateOnboarding]);

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
      } catch (e) {
        console.warn('Auth restore failed, clearing token', e);
        await storage.clearToken();
        setAuthToken(null);
      } finally {
        if (mounted) {
          setHydrated();
          // Push is fire-and-forget OUTSIDE auth try/catch
          // A push error must NEVER wipe the auth token
          registerForPushNotifications()
            .then((pt) => {
              if (pt) {
                api
                  .post('/push/register', { token: pt, platform: Platform.OS })
                  .catch(() => {});
              }
            })
            .catch(() => {});
        }
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

    // User tapped a notification while the app was already running or in the
    // background. Resolve the target route and stash it — the effect below
    // performs the actual navigation once auth/onboarding are resolved.
    notifRespRef.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as any;
        const route = notificationRouteFor(data);
        if (route) setPendingRoute(route);
      });

    // Cold start: the app was launched by tapping a notification. This isn't
    // delivered to the listener above, so read it explicitly once.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        const data = response?.notification.request.content.data as any;
        const route = notificationRouteFor(data);
        if (route) setPendingRoute(route);
      })
      .catch(() => {});

    return () => {
      notifSubRef.current?.remove();
      notifRespRef.current?.remove();
    };
  }, []);

  // Apply a pending notification route once the app is ready and the user is
  // authenticated. If they aren't logged in, the auth guards below take over
  // and we simply drop the deep link.
  useEffect(() => {
    if (!pendingRoute) return;
    if (!hydrated || onboardingDone === null) return; // still on splash
    if (!user) {
      setPendingRoute(null); // can't deep-link a logged-out user
      return;
    }
    // Don't fight the identity/onboarding gates — wait until they're cleared.
    const needsGate =
      !user.username || !user.avatar || !onboardingDone;
    if (needsGate) return;

    const route = pendingRoute;
    setPendingRoute(null);
    router.push(route);
  }, [pendingRoute, hydrated, onboardingDone, user, router]);

  if (!hydrated || onboardingDone === null) {
    return <SplashLoader />;
  }

  const inAuthGroup = segments[0] === '(auth)';
  const inTabsGroup = segments[0] === '(tabs)';
  const inQuizFlow = segments[0] === 'quiz';
  const inIdentity = segments[0] === '(auth)' && segments[1] === 'identity';
  const inOnboarding = segments[0] === 'onboarding';

  const needsIdentity = !!user && (!user.username || !user.avatar);

  // The <Stack> must ALWAYS be mounted — returning <Redirect> instead of the
  // navigator unmounts it, and every queued navigation action then fails with
  // "was not handled by any navigator" / "Cannot read property 'stale'".
  // Render the redirect as a sibling so the navigator stays alive.
  let redirect: string | null = null;
  if (!user && (inTabsGroup || inQuizFlow)) redirect = '/(auth)/login';
  else if (user && needsIdentity && !inIdentity) redirect = '/(auth)/identity';
  else if (user && !needsIdentity && !onboardingDone && !inOnboarding)
    redirect = '/onboarding';
  else if (user && inAuthGroup && !inIdentity) redirect = '/(tabs)/home';

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      {redirect && <Redirect href={redirect as any} />}
    </>
  );
}
