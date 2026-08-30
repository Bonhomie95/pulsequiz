import { Platform } from 'react-native';
import mobileAds, {
  AdsConsent,
  AdsConsentStatus,
} from 'react-native-google-mobile-ads';
import {
  getTrackingPermissionsAsync,
  requestTrackingPermissionsAsync,
} from 'expo-tracking-transparency';
import { logger } from '@/src/utils/logger';

let started = false;

/**
 * GDPR/UMP consent + App Tracking Transparency + Mobile Ads SDK init.
 *
 * Three separate obligations, in a required order:
 *
 *  1. UMP (Google) — the EEA/UK consent form. Must resolve before the ads SDK
 *     is initialized.
 *  2. ATT (Apple) — a distinct prompt governing IDFA access. The ads SDK does
 *     NOT raise it; without an explicit request the IDFA is never available,
 *     and shipping a privacy manifest that declares tracking while never
 *     prompting is grounds for rejection. Apple also requires ATT to come
 *     after any GDPR consent UI, not before.
 *  3. Only then initialize the ads SDK.
 *
 * Everything is best-effort: if a step fails (offline, form unavailable) the
 * SDK is still initialized so non-personalized ads can serve.
 */
export async function initAdsWithConsent(): Promise<void> {
  if (started) return;
  started = true;

  try {
    const info = await AdsConsent.requestInfoUpdate();
    if (
      info.isConsentFormAvailable &&
      info.status === AdsConsentStatus.REQUIRED
    ) {
      await AdsConsent.loadAndShowConsentFormIfRequired();
    }
  } catch (e) {
    logger.warn('[Ads] consent flow failed', e);
  }

  // ATT must follow the GDPR form, per Apple's guidance on consent ordering.
  if (Platform.OS === 'ios') {
    try {
      const current = await getTrackingPermissionsAsync();
      // Only prompt when iOS will actually show it; once decided, asking again
      // is a no-op and the returned status is the user's standing answer.
      if (current.canAskAgain && current.status === 'undetermined') {
        await requestTrackingPermissionsAsync();
      }
    } catch (e) {
      logger.warn('[Ads] ATT request failed', e);
    }
  }

  try {
    await mobileAds().initialize();
  } catch (e) {
    logger.warn('[Ads] SDK init failed', e);
  }
}
