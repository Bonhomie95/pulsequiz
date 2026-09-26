import { Platform } from 'react-native';

import { logger } from '@/src/utils/logger';

type Kind = 'REWARDED' | 'INTERSTITIAL' | 'BANNER';

/** Google's public demo publisher. Its units always serve, and earn nothing. */
const TEST_PUBLISHER = 'ca-app-pub-3940256099942544';

/** True for one of Google's own test units — safe to run, but never revenue. */
export function isTestAdUnit(id: string): boolean {
  return id.startsWith(TEST_PUBLISHER);
}

/**
 * AdMob unit ids are per platform (and this app's iOS and Android apps sit
 * under different publisher ids), so one shared id served nothing on one of
 * them. `EXPO_PUBLIC_ADMOB_<KIND>_ID_IOS` / `_ANDROID` win; the unsuffixed
 * variable is a fallback for single-platform setups.
 *
 * process.env.X must be written out literally — Expo inlines only static
 * member accesses at build time.
 */
const IDS: Record<Kind, { ios?: string; android?: string; any?: string }> = {
  REWARDED: {
    ios: process.env.EXPO_PUBLIC_ADMOB_REWARDED_ID_IOS,
    android: process.env.EXPO_PUBLIC_ADMOB_REWARDED_ID_ANDROID,
    any: process.env.EXPO_PUBLIC_ADMOB_REWARDED_ID,
  },
  INTERSTITIAL: {
    ios: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID_IOS,
    android: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID_ANDROID,
    any: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID,
  },
  BANNER: {
    ios: process.env.EXPO_PUBLIC_ADMOB_BANNER_ID_IOS,
    android: process.env.EXPO_PUBLIC_ADMOB_BANNER_ID_ANDROID,
    any: process.env.EXPO_PUBLIC_ADMOB_BANNER_ID,
  },
};

/** The live unit id for this platform, or '' if none is configured. */
export function adUnitId(kind: Kind): string {
  const ids = IDS[kind];
  const id = (Platform.OS === 'ios' ? ids.ios : ids.android) || ids.any || '';
  // Shipping test units earns nothing, and it is easy to forget one is still
  // configured. Say so loudly in any build that isn't a dev build.
  if (id && !__DEV__ && isTestAdUnit(id)) {
    logger.warn('Using a Google TEST ad unit — this build earns no ad revenue', {
      kind,
      platform: Platform.OS,
    });
  }
  return id;
}
