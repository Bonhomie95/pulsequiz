import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'auth_token';
const REFRESH_KEY = 'auth_refresh_token';

const KEYS = {
  LAST_CATEGORY: 'last_category',
};

const LAST_SCORE_KEY = 'last_score';

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
  getToken: () => SecureStore.getItemAsync(TOKEN_KEY),
  setToken: (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token),

  getRefreshToken: () => SecureStore.getItemAsync(REFRESH_KEY),
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
