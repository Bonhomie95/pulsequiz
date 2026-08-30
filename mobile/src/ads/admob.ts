import {
  RewardedAd,
  InterstitialAd,
  AdEventType,
  RewardedAdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';

const rewardedUnitId = __DEV__
  ? TestIds.REWARDED
  : process.env.EXPO_PUBLIC_ADMOB_REWARDED_ID!;

const interstitialUnitId = __DEV__
  ? TestIds.INTERSTITIAL
  : process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID!;

/* ---------------- REWARDED ---------------- */

export async function showRewardedAd(): Promise<boolean> {
  return new Promise((resolve) => {
    const rewarded = RewardedAd.createForAdRequest(rewardedUnitId);

    let earned = false;
    let settled = false;

    const unsubEarn = rewarded.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      () => {
        earned = true;
      },
    );

    const unsubLoaded = rewarded.addAdEventListener(
      RewardedAdEventType.LOADED,
      () => {
        rewarded.show();
      },
    );

    // Single teardown path: unsubscribe every listener and resolve exactly
    // once. Without this, a load ERROR (no fill / network) would leave the
    // listeners subscribed forever and the promise hanging — a leak that
    // accumulates over a long session.
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unsubEarn();
      unsubLoaded();
      unsubClosed();
      unsubError();
      resolve(result);
    };

    const unsubClosed = rewarded.addAdEventListener(AdEventType.CLOSED, () =>
      finish(earned),
    );
    const unsubError = rewarded.addAdEventListener(AdEventType.ERROR, () =>
      finish(false),
    );

    // Safety net: never let the promise hang if no event ever fires.
    const timeout = setTimeout(() => finish(earned), 30_000);

    rewarded.load();
  });
}

/* ---------------- INTERSTITIAL ---------------- */

/**
 * True from the moment a request starts until the ad closes, errors, or times
 * out.
 *
 * Interstitials are full-screen and every caller is independent — the 10-minute
 * usage timer, the quiz result screen, the PvP result screen, the challenge
 * reward. Without a shared guard, two callers overlapping each create their own
 * ad and each calls show(), so the player closes one and is immediately facing
 * another. The usage timer could do this to itself: its interval keeps firing
 * every 5s while an ad is on screen, stacking a fresh one each tick.
 */
let interstitialInFlight = false;

/** Visible for tests. */
export function isInterstitialInFlight() {
  return interstitialInFlight;
}

export async function showInterstitialAd(): Promise<boolean> {
  // Never stack. A caller arriving while one is already up is dropped rather
  // than queued — a queued ad would simply appear the instant the first closes,
  // which is the same complaint from the player's side.
  if (interstitialInFlight) return false;
  interstitialInFlight = true;

  return new Promise((resolve) => {
    const interstitial = InterstitialAd.createForAdRequest(interstitialUnitId);

    let settled = false;

    const unsubLoaded = interstitial.addAdEventListener(
      AdEventType.LOADED,
      () => {
        interstitial.show();
      },
    );

    // Resolve once and tear down all listeners — including on ERROR, which
    // otherwise leaks a listener + hangs the promise on every failed load
    // (the usage timer fires one of these every 10 minutes).
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unsubLoaded();
      unsubClosed();
      unsubError();
      interstitialInFlight = false;
      resolve(result);
    };

    const unsubClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () =>
      finish(true),
    );
    const unsubError = interstitial.addAdEventListener(AdEventType.ERROR, () =>
      finish(false),
    );

    const timeout = setTimeout(() => finish(false), 30_000);

    interstitial.load();
  });
}
