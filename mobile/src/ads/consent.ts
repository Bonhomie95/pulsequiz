import mobileAds, {
  AdsConsent,
  AdsConsentStatus,
} from 'react-native-google-mobile-ads';
import { logger } from '@/src/utils/logger';

let started = false;

/**
 * GDPR/UMP consent + Mobile Ads SDK initialization.
 *
 * Google Play & the App Store require a consent flow for EEA/UK users before
 * serving personalized ads, and the SDK must not be initialized until consent
 * is resolved. Call this once at app startup. On iOS the SDK also surfaces the
 * App Tracking Transparency prompt (backed by NSUserTrackingUsageDescription).
 *
 * Everything is best-effort: if the consent request fails (offline, etc.) we
 * still initialize the SDK so non-personalized ads can serve.
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

  try {
    await mobileAds().initialize();
  } catch (e) {
    logger.warn('[Ads] SDK init failed', e);
  }
}
