import { AppState, AppStateStatus } from 'react-native';
import { showInterstitialAd } from './admob';
import { useAppStateStore } from '@/src/store/useAppStateStore';

let timer: ReturnType<typeof setInterval> | null = null;
let appState: AppStateStatus = AppState.currentState;
let appStateSub: { remove: () => void } | null = null;

// ⏱ 10 minutes in ms
const INTERVAL_MS = 10 * 60 * 1000;
const TICK_MS = 5 * 1000;

let startedAt: number | null = null;

export function startUsageAdTimer() {
  if (timer) return;

  // mark session start
  startedAt = Date.now();

  appStateSub = AppState.addEventListener('change', (next) => {
    appState = next;

    // ⏸ pause timer in background
    if (next !== 'active') {
      startedAt = null;
      return;
    }

    // ▶️ resume fresh when returning
    if (!startedAt) {
      startedAt = Date.now();
    }
  });

  timer = setInterval(async () => {
    if (appState !== 'active') return;
    if (!startedAt) return;

    const elapsed = Date.now() - startedAt;

    if (elapsed < INTERVAL_MS) return;

    const { isPlayingQuiz, skipNextInterstitial } = useAppStateStore.getState();

    // ❌ never interrupt quiz
    if (isPlayingQuiz) return;

    // ⏭ skip once if rewarded ad just played
    if (skipNextInterstitial) {
      useAppStateStore.getState().clearSkipInterstitial();
      startedAt = Date.now(); // 🔁 reset countdown
      return;
    }

    try {
      await showInterstitialAd();
    } catch (e) {
      console.warn('Interstitial ad failed', e);
    }

    // 🔁 reset after ad close
    startedAt = Date.now();
  }, TICK_MS);
}

export function stopUsageAdTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  if (appStateSub) {
    appStateSub.remove();
    appStateSub = null;
  }

  startedAt = null;
}

export function resetUsageAdTimer() {
  startedAt = Date.now();
}
