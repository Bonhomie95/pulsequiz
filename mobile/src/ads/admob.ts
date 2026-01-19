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

    const unsubClosed = rewarded.addAdEventListener(
      AdEventType.CLOSED, // ✅ THIS IS CORRECT
      () => {
        unsubEarn();
        unsubLoaded();
        unsubClosed();
        resolve(earned);
      },
    );

    rewarded.load();
  });
}

/* ---------------- INTERSTITIAL ---------------- */

export async function showInterstitialAd(): Promise<boolean> {
  return new Promise((resolve) => {
    const interstitial = InterstitialAd.createForAdRequest(interstitialUnitId);

    const unsubLoaded = interstitial.addAdEventListener(
      AdEventType.LOADED,
      () => {
        interstitial.show();
      },
    );

    const unsubClosed = interstitial.addAdEventListener(
      AdEventType.CLOSED,
      () => {
        unsubLoaded();
        unsubClosed();
        resolve(true);
      },
    );

    interstitial.load();
  });
}
