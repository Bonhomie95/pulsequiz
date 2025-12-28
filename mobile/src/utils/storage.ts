import AsyncStorage from '@react-native-async-storage/async-storage';

export const storage = {
  setLastCategory: async (category: string) => {
    try {
      await AsyncStorage.setItem('lastCategory', category);
    } catch {}
  },

  getLastCategory: async () => {
    try {
      return await AsyncStorage.getItem('lastCategory');
    } catch {
      return null;
    }
  },
};
