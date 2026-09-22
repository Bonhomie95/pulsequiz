import { Redirect, Stack, useRouter, useSegments } from 'expo-router';
import type { Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';

import { storage } from '../src/utils/storage';
import { api, setAuthToken } from '../src/api/api';
import { useAuthStore } from '../src/store/useAuthStore';
import { usePremiumStore } from '../src/store/usePremiumStore';
import { useOnboardingStore } from '../src/store/useOnboardingStore';
import { initAdsWithConsent } from '@/src/ads/consent';
import { notificationRouteFor } from '@/src/utils/notificationRoutes';
import { registerAndSyncPushToken } from '@/src/utils/push';
import { reconcilePendingPurchases } from '@/src/iap/verify';
import { logger } from '@/src/utils/logger';
import { initSentry, setSentryUser, wrapWithSentry } from '@/src/utils/sentry';
import { ErrorBoundary } from '@/src/components/ErrorBoundary';
import SplashLoader from '@/src/components/SplashLoader';

// Initialize crash reporting as early as possible (module load, before render).
initSentry();

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

function RootLayout() {
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
    // UMP consent + Mobile Ads SDK init (before any ad). Interstitials only
    // appear at natural breaks (quiz/PvP result) — the old 10-minute timer
    // could interrupt a live match or a purchase, which AdMob policy forbids.
    initAdsWithConsent();
    hydrateOnboarding();
  }, [hydrateOnboarding]);

  // Tag crash reports with the signed-in user (and clear on logout).
  useEffect(() => {
    setSentryUser(user ? { id: user.id, username: user.username } : null);
  }, [user]);

  // Once per signed-in user — on restore AND on a fresh sign-in (previously
  // only a relaunch registered push). Fire-and-forget, outside any auth
  // try/catch: a push or store error must never touch the session.
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    registerAndSyncPushToken();
    // Credit purchases paid for but never confirmed (app killed mid-purchase,
    // or offline at verify time). Android refunds unacknowledged ones in 3 days.
    reconcilePendingPurchases();
  }, [userId]);

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

        // A pre-versioning token gets swapped for a modern short-lived pair on
        // the first call. Store it, or the old ten-year token keeps being used.
        if (r.data.token) {
          await useAuthStore.getState().setSession(r.data.token, r.data.refreshToken);
        }

        setUser(r.data.user);
        checkPremium();
      } catch (e: any) {
        // Only a rejected credential ends the session. Being offline at launch
        // used to wipe the token and force a fresh OAuth sign-in.
        const status = e?.response?.status;
        if (status === 401 || status === 403) {
          logger.warn('Auth restore rejected, clearing token', { status });
          await storage.clearToken();
          setAuthToken(null);
        } else {
          logger.warn('Auth restore failed (network) — keeping session', { error: String(e) });
        }
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

  // expo-router types `useSegments()` against the route tree it generates into
  // .expo/types/router.d.ts — a file that is gitignored and only written by a
  // dev/build run. Locally it exists and segments is a rich tuple union; in CI
  // it does not, so the type collapses to `[string]` and indexing past 0 fails
  // to compile. The runtime value is a plain string array either way, and this
  // is ordinary string matching, so read it as one rather than letting the
  // build depend on whether a generated file happens to be present.
  const path = segments as readonly string[];

  const inAuthGroup = path[0] === '(auth)';
  const inIdentity = path[0] === '(auth)' && path[1] === 'identity';
  const inOnboarding = path[0] === 'onboarding';
  // Screens a signed-out visitor may see: sign-in, the guest taster, and the
  // index redirect itself. Everything else needs an account.
  const isPublic = path.length === 0 || path[0] === 'index' || inAuthGroup || path[0] === 'guest';

  const needsIdentity = !!user && (!user.username || !user.avatar);

  // The <Stack> must ALWAYS be mounted — returning <Redirect> instead of the
  // navigator unmounts it, and every queued navigation action then fails with
  // "was not handled by any navigator" / "Cannot read property 'stale'".
  // Render the redirect as a sibling so the navigator stays alive.
  let redirect: string | null = null;
  if (!user && !isPublic) redirect = '/(auth)/login';
  else if (user && needsIdentity && !inIdentity) redirect = '/(auth)/identity';
  else if (user && !needsIdentity && !onboardingDone && !inOnboarding)
    redirect = '/onboarding';
  else if (user && inAuthGroup && !inIdentity) redirect = '/(tabs)/home';

  return (
    <ErrorBoundary>
      <Stack screenOptions={{ headerShown: false }} />
      {redirect && <Redirect href={redirect as any} />}
    </ErrorBoundary>
  );
}

// Sentry.wrap adds navigation/performance instrumentation and an outer error
// handler around the whole app.
export default wrapWithSentry(RootLayout);
