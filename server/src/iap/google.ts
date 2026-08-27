import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { logger } from '../utils/logger';

// ── Lazy initialisation ────────────────────────────────────────────────────
// We defer parsing the service account JSON until the first call so that
// the server doesn't crash on startup when the env var isn't set yet
// (useful during local dev / CI before credentials are wired in).

let _androidPublisher: ReturnType<typeof google.androidpublisher> | null = null;

function getAndroidPublisher() {
  if (_androidPublisher) return _androidPublisher;

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON env var is not set. ' +
        'See SETUP.md for instructions on generating a service account key.',
    );
  }

  let creds: Record<string, string>;
  try {
    creds = JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.');
  }

  // Private keys stored in env vars sometimes have escaped newlines
  if (creds.private_key) {
    creds.private_key = creds.private_key.replace(/\\n/g, '\n');
  }

  const authClient = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });

  _androidPublisher = google.androidpublisher({
    version: 'v3',
    auth: authClient,
  });
  return _androidPublisher;
}

// ── Package name ───────────────────────────────────────────────────────────

/**
 * The package name must never be trusted from the client — otherwise a token
 * bought in a different app with matching product IDs could be verified and
 * credited here. Set ANDROID_PACKAGE_NAME in the environment; the client
 * value is only accepted (with a warning) when the env var is missing.
 */
export function resolveTrustedPackageName(
  clientValue?: string,
): { packageName: string } | { error: string } {
  const trusted = process.env.ANDROID_PACKAGE_NAME;
  if (trusted) {
    if (clientValue && clientValue !== trusted) {
      return { error: 'Package name mismatch' };
    }
    return { packageName: trusted };
  }
  if (!clientValue) return { error: 'packageName required' };
  // Re-evaluated on every verification, so log it once an hour rather than
  // once per purchase — the fact does not change until someone sets the var.
  logger.once(
    'google-iap-missing-package-name',
    'warn',
    'ANDROID_PACKAGE_NAME not set — trusting client-supplied packageName. Set it in .env.',
  );
  return { packageName: clientValue };
}

// ── Types ──────────────────────────────────────────────────────────────────

type VerifyGoogleParams = {
  packageName: string;
  productId: string; // SKU
  purchaseToken: string;
};

export interface GoogleVerifyResult {
  valid: boolean;
  purchaseState: number;
  consumptionState: number;
  acknowledgementState: number;
  data: Record<string, any> | null;
  error?: string;
}

// ── Main verification function ─────────────────────────────────────────────

/**
 * Verify a Google Play one-time in-app product purchase.
 *
 * purchaseState values:
 *   0 = purchased, 1 = cancelled, 2 = pending
 *
 * consumptionState values:
 *   0 = not consumed (safe to credit), 1 = consumed (already used)
 *
 * acknowledgementState values:
 *   0 = not acknowledged (we must acknowledge within 3 days or Google refunds)
 *   1 = acknowledged
 */
export async function verifyGooglePurchase(
  params: VerifyGoogleParams,
): Promise<GoogleVerifyResult> {
  const { packageName, productId, purchaseToken } = params;

  try {
    const publisher = getAndroidPublisher();

    const res = await publisher.purchases.products.get({
      packageName,
      productId,
      token: purchaseToken,
    });

    const data = res.data;

    const purchaseState = data.purchaseState ?? -1;
    const consumptionState = data.consumptionState ?? -1;
    const acknowledgementState = data.acknowledgementState ?? 0;

    // Valid = purchased AND not already consumed (prevents double-credit)
    const valid = purchaseState === 0 && consumptionState === 0;

    // Acknowledge if valid and not already acknowledged.
    // Google Play requires acknowledgement within 3 days or it auto-refunds.
    if (valid && acknowledgementState === 0) {
      await publisher.purchases.products.acknowledge({
        packageName,
        productId,
        token: purchaseToken,
        requestBody: {},
      });
    }

    return {
      valid,
      purchaseState,
      consumptionState,
      acknowledgementState,
      data: data as Record<string, any>,
    };
  } catch (err: any) {
    logger.error('Google IAP verification threw', err);
    return {
      valid: false,
      purchaseState: -1,
      consumptionState: -1,
      acknowledgementState: 0,
      data: null,
      error: err?.message,
    };
  }
}
