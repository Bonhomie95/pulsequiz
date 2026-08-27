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

export async function showInterstitialAd(): Promise<boolean> {
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
