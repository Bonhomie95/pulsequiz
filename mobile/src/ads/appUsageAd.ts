import { AppState, AppStateStatus } from 'react-native';
import { showInterstitialAd } from './admob';
import { useAppStateStore } from '@/src/store/useAppStateStore';
import { usePremiumStore } from '@/src/store/usePremiumStore';

let timer: ReturnType<typeof setInterval> | null = null;
let appState: AppStateStatus = AppState.currentState;
let appStateSub: { remove: () => void } | null = null;
const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const TICK_MS = 5 * 1000; // check every 5 seconds
let startedAt: number | null = null;

export function startUsageAdTimer() {
  if (timer) return;

  startedAt = Date.now();

  appStateSub = AppState.addEventListener('change', (next) => {
    appState = next;
    if (next !== 'active') {
      startedAt = null;
      return;
    }
    if (!startedAt) startedAt = Date.now();
  });

  timer = setInterval(async () => {
    if (appState !== 'active' || !startedAt) return;
    if (Date.now() - startedAt < INTERVAL_MS) return;

    // ── Premium gate — skip interstitial, just reset timer ──────────────
    const isPremium = usePremiumStore.getState().isPremium;
    if (isPremium) {
      startedAt = Date.now();
      return;
    }

    const { isPlayingQuiz, skipNextInterstitial } = useAppStateStore.getState();
    if (isPlayingQuiz) return; // never interrupt quiz

    if (skipNextInterstitial) {
      useAppStateStore.getState().clearSkipInterstitial(); // courtesy skip after rewarded ad
      startedAt = Date.now();
      return;
    }

    try {
      await showInterstitialAd();
    } catch (e) {
      console.warn('[InterstitialAd] failed', e);
    }

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
