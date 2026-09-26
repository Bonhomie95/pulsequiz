/**
 * Rewarded ads are only offered where the reward can actually be paid.
 *
 * The server credits coins solely from Google's signed verification callback,
 * and no such callback can be attached to Google's own *test* units. So a
 * release build running a test unit must hide "watch an ad" rather than play
 * one and quietly pay nothing.
 */
jest.mock('react-native-google-mobile-ads', () => ({
  __esModule: true,
  default: () => ({ initialize: jest.fn().mockResolvedValue(undefined) }),
  AdEventType: { LOADED: 'loaded', CLOSED: 'closed', ERROR: 'error' },
  RewardedAdEventType: { LOADED: 'rewarded_loaded', EARNED_REWARD: 'earned' },
  TestIds: { INTERSTITIAL: 'test-int', REWARDED: 'test-rew', BANNER: 'test-ban' },
  MaxAdContentRating: { G: 'G', PG: 'PG', T: 'T', MA: 'MA' },
  InterstitialAd: { createForAdRequest: () => ({ addAdEventListener: () => () => {}, load: () => {}, show: () => {} }) },
  RewardedAd: { createForAdRequest: () => ({ addAdEventListener: () => () => {}, load: () => {}, show: () => {} }) },
}));

const TEST_UNIT = 'ca-app-pub-3940256099942544/1712485313';
const REAL_UNIT = 'ca-app-pub-3226169062425843/5799411496';

/** Load the module fresh with a given rewarded unit and __DEV__ setting. */
function availabilityFor(unit: string, dev: boolean): boolean {
  jest.resetModules();
  process.env.EXPO_PUBLIC_ADMOB_REWARDED_ID_IOS = unit;
  process.env.EXPO_PUBLIC_ADMOB_REWARDED_ID_ANDROID = unit;
  (global as any).__DEV__ = dev;
  // require, not import(): jest runs these files as CommonJS.
  return require('../admob').rewardedAdsAvailable;
}

const originalDev = (global as any).__DEV__;
afterAll(() => {
  (global as any).__DEV__ = originalDev;
});

describe('rewardedAdsAvailable', () => {
  it('is off in a release build running a Google test unit', () => {
    expect(availabilityFor(TEST_UNIT, false)).toBe(false);
  });

  it('is on for our own unit', () => {
    expect(availabilityFor(REAL_UNIT, false)).toBe(true);
  });

  it('stays on in development, where test units are expected', () => {
    expect(availabilityFor(TEST_UNIT, true)).toBe(true);
  });
});
