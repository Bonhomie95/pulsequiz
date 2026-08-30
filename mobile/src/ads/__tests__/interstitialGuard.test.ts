/**
 * Only one interstitial may ever be on screen.
 *
 * Four independent callers can request one — the 10-minute usage timer, the
 * quiz result screen, the PvP result screen, and the challenge reward — and the
 * usage timer's interval keeps firing while an ad is already up. Without a
 * shared guard the player closes one ad and immediately faces another.
 */

type Handler = () => void;

/**
 * jest.mock factories may only close over variables whose names begin with
 * `mock`, so the fake ad's state lives in one such object.
 */
const mockAd = {
  handlers: {} as Record<string, Handler[]>,
  shows: [] as number[],
  created: 0,
};

jest.mock('react-native-google-mobile-ads', () => ({
  __esModule: true,
  default: () => ({ initialize: jest.fn().mockResolvedValue(undefined) }),
  AdEventType: { LOADED: 'loaded', CLOSED: 'closed', ERROR: 'error' },
  RewardedAdEventType: { LOADED: 'rewarded_loaded', EARNED_REWARD: 'earned' },
  TestIds: { INTERSTITIAL: 'test-int', REWARDED: 'test-rew', BANNER: 'test-ban' },
  MaxAdContentRating: { G: 'G', PG: 'PG', T: 'T', MA: 'MA' },
  InterstitialAd: {
    createForAdRequest: () => {
      const id = mockAd.created++;
      return {
        addAdEventListener: (type: string, cb: Handler) => {
          (mockAd.handlers[type] ??= []).push(cb);
          return () => {
            mockAd.handlers[type] = (mockAd.handlers[type] ?? []).filter((h) => h !== cb);
          };
        },
        load: () => {},
        show: () => mockAd.shows.push(id),
      };
    },
  },
  RewardedAd: { createForAdRequest: () => ({ addAdEventListener: () => () => {}, load: () => {}, show: () => {} }) },
  BannerAd: () => null,
  BannerAdSize: {},
}));

const fire = (type: string) => [...(mockAd.handlers[type] ?? [])].forEach((h) => h());

describe('interstitial concurrency', () => {
  beforeEach(() => {
    for (const k of Object.keys(mockAd.handlers)) delete mockAd.handlers[k];
    mockAd.shows.length = 0;
    mockAd.created = 0;
    jest.resetModules();
  });

  it('a second request while one is in flight is dropped, not stacked', async () => {
    const { showInterstitialAd, isInterstitialInFlight } = require('../admob');

    const first = showInterstitialAd();
    expect(isInterstitialInFlight()).toBe(true);

    // The usage timer ticking again 5s later, while the first ad is loading.
    const second = await showInterstitialAd();
    expect(second).toBe(false);

    fire('loaded');
    // Exactly one ad was ever shown, despite two callers.
    expect(mockAd.shows).toHaveLength(1);

    fire('closed');
    await expect(first).resolves.toBe(true);
    expect(isInterstitialInFlight()).toBe(false);
  });

  it('releases the guard after an ad closes, so the next one can show', async () => {
    const { showInterstitialAd, isInterstitialInFlight } = require('../admob');

    const a = showInterstitialAd();
    fire('loaded');
    fire('closed');
    await a;
    expect(isInterstitialInFlight()).toBe(false);

    const b = showInterstitialAd();
    fire('loaded');
    fire('closed');
    await expect(b).resolves.toBe(true);
    expect(mockAd.shows).toHaveLength(2);
  });

  it('releases the guard when the load errors, so ads are not disabled forever', async () => {
    const { showInterstitialAd, isInterstitialInFlight } = require('../admob');

    const a = showInterstitialAd();
    fire('error');
    await expect(a).resolves.toBe(false);
    // A stuck flag here would silently kill every future interstitial.
    expect(isInterstitialInFlight()).toBe(false);
  });
});
