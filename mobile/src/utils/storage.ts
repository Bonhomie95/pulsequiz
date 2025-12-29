import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'auth_token';

const KEYS = {
  LAST_CATEGORY: 'last_category',
  TOKEN: 'auth_token',
};

export const storage = {
  /* ---------------- CATEGORY ---------------- */
  async setLastCategory(category: string) {
    await AsyncStorage.setItem(KEYS.LAST_CATEGORY, category);
  },

  async getLastCategory(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.LAST_CATEGORY);
  },

  /* ---------------- AUTH ---------------- */
  getToken: () => SecureStore.getItemAsync(TOKEN_KEY),
  setToken: (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token),
  clearToken: () => SecureStore.deleteItemAsync(TOKEN_KEY),
};
