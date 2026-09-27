import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { logger } from './logger';

const TOKEN_KEY = 'auth_token';
const REFRESH_KEY = 'auth_refresh_token';

const KEYS = {
  LAST_CATEGORY: 'last_category',
};

const LAST_SCORE_KEY = 'last_score';

async function readSecure(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (err) {
    logger.warn('Keychain read failed — treating as no session', { key, err: String(err) });
    return null;
  }
}

export const storage = {
  /* ---------------- CATEGORY ---------------- */
  async setLastCategory(category: string) {
    await AsyncStorage.setItem(KEYS.LAST_CATEGORY, category);
  },

  async getLastCategory(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.LAST_CATEGORY);
  },

  async setLastScore(score: number) {
    await AsyncStorage.setItem(LAST_SCORE_KEY, String(score));
  },

  async getLastScore(): Promise<number | null> {
    const v = await AsyncStorage.getItem(LAST_SCORE_KEY);
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  },

  /* ---------------- AUTH ---------------- */
  // Both tokens live in the keychain/keystore, never AsyncStorage — the
  // refresh token is a long-lived credential and must not sit in a plaintext
  // store that a device backup would carry off.
  // A read that throws means the keychain is unreadable — a locked device, a
  // build without the entitlement, a keychain error. There is no session we
  // can act on either way, so report that rather than rejecting: these are
  // called from effects that never awaited a rejection, and every failure
  // surfaced as an uncaught promise instead of a signed-out user.
  //
  // Writes are deliberately left to throw: a token that silently failed to
  // save logs the player out on next launch with no clue why.
  getToken: () => readSecure(TOKEN_KEY),
  setToken: (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token),

  getRefreshToken: () => readSecure(REFRESH_KEY),
  setRefreshToken: (token: string) => SecureStore.setItemAsync(REFRESH_KEY, token),

  async setSession(token: string, refreshToken?: string | null) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    if (refreshToken) await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
  },

  async clearToken() {
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_KEY),
    ]);
  },
};
