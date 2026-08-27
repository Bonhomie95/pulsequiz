import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { api } from '@/src/api/api';
import { logger } from '@/src/utils/logger';

// The last Expo push token we synced, so we can unregister it on logout.
let currentToken: string | null = null;
let tokenSub: { remove: () => void } | null = null;

async function getExpoToken(): Promise<string | null> {
  if (!Device.isDevice) return null; // simulators can't receive push

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'PulseQuiz',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6366F1',
    });
  }

  const { data } = await Notifications.getExpoPushTokenAsync();
  return data ?? null;
}

async function sync(token: string) {
  currentToken = token;
  try {
    await api.post('/push/register', { token, platform: Platform.OS });
  } catch (e) {
    logger.warn('[Push] register failed', e);
  }
}

/**
 * Request permission, register the device's push token with the backend, and
 * keep it fresh if the OS rotates it. Safe to call once after auth is restored.
 */
export async function registerAndSyncPushToken(): Promise<void> {
  try {
    const token = await getExpoToken();
    if (token) await sync(token);

    // Re-sync if the token rotates while the app is running.
    if (!tokenSub) {
      tokenSub = Notifications.addPushTokenListener((t) => {
        const next = (t as any)?.data;
        if (typeof next === 'string' && next !== currentToken) sync(next);
      });
    }
  } catch (e) {
    logger.warn('[Push] token setup failed', e);
  }
}

/**
 * Deactivate this device's token server-side. MUST run while the auth header
 * is still set (i.e. before clearing the token on logout), otherwise the next
 * user on this device could receive the previous user's notifications.
 */
export async function unregisterPushToken(): Promise<void> {
  if (!currentToken) return;
  const token = currentToken;
  currentToken = null;
  try {
    await api.delete('/push/unregister', { data: { token } });
  } catch (e) {
    logger.warn('[Push] unregister failed', e);
  }
}
