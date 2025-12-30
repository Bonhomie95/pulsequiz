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

    const unsubscribe = rewarded.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      () => {
        unsubscribe();
        resolve(true);
      }
    );

    const unsubscribeClosed = rewarded.addAdEventListener(
      AdEventType.CLOSED,
      () => {
        unsubscribe();
        unsubscribeClosed();
        resolve(false);
      }
    );

    rewarded.load();
  });
}

/* ---------------- INTERSTITIAL ---------------- */

export async function showInterstitialAd(): Promise<boolean> {
  return new Promise((resolve) => {
    const interstitial = InterstitialAd.createForAdRequest(
      interstitialUnitId
    );

    const unsubscribe = interstitial.addAdEventListener(
      AdEventType.CLOSED,
      () => {
        unsubscribe();
        resolve(true);
      }
    );

    interstitial.load();
  });
}
