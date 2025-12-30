import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'auth_token';

const KEYS = {
  LAST_CATEGORY: 'last_category',
  TOKEN: 'auth_token',
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
  getToken: () => SecureStore.getItemAsync(TOKEN_KEY),
  setToken: (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token),
  clearToken: () => SecureStore.deleteItemAsync(TOKEN_KEY),
};
