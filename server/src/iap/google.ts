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

export async function verifyGooglePurchase(params: {
  packageName: string;
  productId: string;
  purchaseToken: string;
}) {
  const { packageName, productId, purchaseToken } = params;

  const res = await androidPublisher.purchases.products.get({
    packageName,
    productId,
    token: purchaseToken,
  });

  const data = res.data;

  const valid = data.purchaseState === 0 && data.consumptionState === 0;

  return {
    valid,
    data,
  };
}
