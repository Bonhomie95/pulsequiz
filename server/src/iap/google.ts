import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

console.log('ENV loaded:', !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

if (!raw) {
  throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is missing');
}

const creds = JSON.parse(raw);

const authClient = new JWT({
  email: creds.client_email,
  key: creds.private_key,
  scopes: ['https://www.googleapis.com/auth/androidpublisher'],
});

export const androidPublisher = google.androidpublisher({
  version: 'v3',
  auth: authClient,
});

type VerifyGoogleParams = {
  packageName: string;
  productId: string; // sku
  purchaseToken: string;
};

export async function verifyGooglePurchase(params: VerifyGoogleParams) {
  const { packageName, productId, purchaseToken } = params;

  // 1) Fetch purchase status
  const res = await androidPublisher.purchases.products.get({
    packageName,
    productId,
    token: purchaseToken,
  });

  const data = res.data;

  /**
   * For one-time INAPP products (not subscriptions), typical useful fields are:
   * - purchaseState: 0 (purchased)
   * - consumptionState: 0 (yet-to-be-consumed / not consumed), 1 (consumed)
   * - acknowledgementState: 0 (not acknowledged), 1 (acknowledged)
   */
  const purchaseState = data.purchaseState ?? -1;
  const consumptionState = data.consumptionState ?? -1;
  const acknowledgementState = data.acknowledgementState ?? 0;

  const valid =
    purchaseState === 0 && // purchased
    consumptionState === 0; // not consumed yet (prevents double-credit)

  // 2) Acknowledge ONLY if valid and not already acknowledged
  // Google requires acknowledgement for Play Billing compliance.
  if (valid && acknowledgementState === 0) {
    await androidPublisher.purchases.products.acknowledge({
      packageName,
      productId, // ✅ not sku
      token: purchaseToken,
      requestBody: {}, // typings sometimes expect this
    });
  }

  return {
    valid,
    data,
    purchaseState,
    consumptionState,
    acknowledgementState,
  };
}
