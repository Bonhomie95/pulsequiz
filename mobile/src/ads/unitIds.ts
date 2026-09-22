import { Platform } from 'react-native';

type Kind = 'REWARDED' | 'INTERSTITIAL' | 'BANNER';

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
  return (Platform.OS === 'ios' ? ids.ios : ids.android) || ids.any || '';
}
