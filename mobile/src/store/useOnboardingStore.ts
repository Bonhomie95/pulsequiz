import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/storageKeys';

type OnboardingState = {
  // null = not yet read from storage (root layout shows the splash until then)
  done: boolean | null;
  hydrate: () => Promise<void>;
  complete: () => Promise<void>;
};

/**
 * Shared onboarding-completion flag. Kept in a store (not local layout state)
 * so that completing onboarding updates the root layout reactively — otherwise
 * the layout keeps a stale `false` and redirects the user back into the flow.
 */
export const useOnboardingStore = create<OnboardingState>((set) => ({
  done: null,

  hydrate: async () => {
    const val = await AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING_DONE);
    set({ done: val === 'true' });
  },

  complete: async () => {
    // Flip the in-memory flag first: navigation away from onboarding must
    // never depend on the disk write succeeding, otherwise a failed write
    // bounces the user straight back into the flow.
    set({ done: true });
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING_DONE, 'true');
    } catch {
      // Worst case: onboarding shows again on next cold start.
    }
  },
}));
