import { AppState, AppStateStatus } from 'react-native';
import { showInterstitialAd } from './admob';
import { useAppStateStore } from '@/src/store/useAppStateStore';
import { usePremiumStore } from '@/src/store/usePremiumStore';
import { logger } from '../utils/logger';

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

    // Reset the window BEFORE awaiting, not after.
    //
    // setInterval does not wait for an async callback, so with the reset at the
    // end this tick's ad was still loading (or on screen) when the next tick
    // fired 5 seconds later — and that tick still saw the interval as elapsed,
    // so it requested another. And another. The player closed one ad only to
    // meet the next. Resetting first means the window restarts the moment we
    // decide to show, and the in-flight guard in showInterstitialAd catches
    // anything that still overlaps.
    startedAt = Date.now();

    try {
      await showInterstitialAd();
    } catch (e) {
      logger.warn('Interstitial ad failed', { error: String(e) });
    }

    // The window runs from when the ad closes, so a long ad does not eat into
    // the next interval.
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
