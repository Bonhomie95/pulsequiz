import axios from 'axios';
import jwt from 'jsonwebtoken';

const APPLE_ISSUER_ID = process.env.APPLE_ISSUER_ID!;
const APPLE_KEY_ID = process.env.APPLE_KEY_ID!;
const APPLE_BUNDLE_ID = process.env.APPLE_BUNDLE_ID!;

// The .p8 key may be stored with literal \n in the env var — normalise it
const APPLE_PRIVATE_KEY = (process.env.APPLE_PRIVATE_KEY ?? '').replace(
  /\\n/g,
  '\n',
);

// Use sandbox for all non-production environments
const APPLE_BASE_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://api.storekit.itunes.apple.com'
    : 'https://api.storekit-sandbox.itunes.apple.com';

/**
 * Build a short-lived ES256 JWT for App Store Server API calls.
 * Apple requires it to expire within 60 minutes.
 */
function makeAppleJWT(): string {
  return jwt.sign(
    {
      iss: APPLE_ISSUER_ID,
      aud: 'appstoreconnect-v1',
      exp: Math.floor(Date.now() / 1000) + 60 * 5, // 5 min
      bid: APPLE_BUNDLE_ID,
    },
    APPLE_PRIVATE_KEY,
    {
      algorithm: 'ES256',
      keyid: APPLE_KEY_ID,
    },
  );
}

export interface AppleVerifyResult {
  valid: boolean;
  productId: string | null;
  environment: string | null;
  data: Record<string, any> | null;
  error?: string;
}

/**
 * Verify a StoreKit 2 transactionId against Apple's server.
 *
 * Apple returns a signed JWT (JWS) for the transaction. We decode it
 * without verifying the Apple signature here (the server API endpoint
 * itself is authoritative — if it returns 200 the transaction is real).
 * For maximum security you can also verify the JWS against Apple's
 * certificate chain, but that's rarely done in practice for consumables.
 */
export async function verifyAppleTransaction(
  transactionId: string,
  expectedSku: string,
): Promise<AppleVerifyResult> {
  try {
    const token = makeAppleJWT();

    const response = await axios.get(
      `${APPLE_BASE_URL}/inApps/v1/transactions/${transactionId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        // Don't throw on 4xx — we want to handle them gracefully
        validateStatus: () => true,
      },
    );

    if (response.status !== 200) {
      console.error(
        `[Apple IAP] Non-200 status ${response.status}:`,
        response.data,
      );
      return {
        valid: false,
        productId: null,
        environment: null,
        data: response.data,
        error: `HTTP ${response.status}`,
      };
    }

    // The response is a signed JWS — decode the payload (middle segment)
    const signedTransaction: string =
      response.data.signedTransactionInfo ?? response.data;
    let t: Record<string, any>;

    if (typeof signedTransaction === 'string') {
      // Base64url-decode the payload segment of the JWS
      const payload = signedTransaction.split('.')[1];
      t = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } else {
      // Already decoded (sandbox sometimes returns plain JSON)
      t = signedTransaction as any;
    }

    const valid =
      t.bundleId === APPLE_BUNDLE_ID &&
      t.productId === expectedSku &&
      !t.revocationDate && // not refunded/revoked
      t.inAppOwnershipType === 'PURCHASED'; // not family-shared

    return {
      valid,
      productId: t.productId ?? null,
      environment: t.environment ?? null, // 'Sandbox' | 'Production'
      data: t,
    };
  } catch (err: any) {
    console.error(
      '[Apple IAP] verifyAppleTransaction error:',
      err?.message ?? err,
    );
    return {
      valid: false,
      productId: null,
      environment: null,
      data: null,
      error: err?.message,
    };
  }
}
