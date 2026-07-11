import { connectSocket } from '@/src/socket/connect';
import { registerPvPSocketListeners } from '@/src/socket/registerListeners';
import { useAuthStore } from '@/src/store/useAuthStore';
import { Redirect } from 'expo-router';
import { useEffect } from 'react';

export default function Index() {
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    connectSocket();
    registerPvPSocketListeners();
  }, []);

  // The root layout keeps the splash up until auth is hydrated, so `user` is
  // already resolved here. Sending a logged-in user straight home avoids a
  // login-screen flash on every cold start (identity/onboarding redirects are
  // handled by the root layout guards).
  return <Redirect href={user ? '/(tabs)/home' : '/(auth)/login'} />;
}
