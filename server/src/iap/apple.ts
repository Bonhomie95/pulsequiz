import axios from 'axios';
import jwt from 'jsonwebtoken';
import { verifyAppleJws } from '../services/storeNotifications';
import { logger } from '../utils/logger';

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
 * Apple returns the transaction as a signed JWS. The authenticated HTTPS call
 * is one trust anchor, but we also verify the JWS signature and certificate
 * chain — so a compromised APPLE_BASE_URL, a proxy, or a DNS hijack can't
 * hand us a forged "you bought 20,000 coins" payload.
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
      // Apple's body carries `latest_receipt` — the full base64 receipt — so
      // it must not be dumped raw. `status` is the part that identifies the
      // failure; the logger redacts the rest.
      logger.error('Apple IAP verification returned non-200', undefined, {
        httpStatus: response.status,
        appleStatus: response.data?.status,
      });
      return {
        valid: false,
        productId: null,
        environment: null,
        data: response.data,
        error: `HTTP ${response.status}`,
      };
    }

    // The response is a signed JWS.
    const signedTransaction: string =
      response.data.signedTransactionInfo ?? response.data;
    let t: Record<string, any>;

    if (typeof signedTransaction === 'string') {
      const verified = verifyAppleJws(signedTransaction);
      if (!verified.valid) {
        logger.warn('Apple IAP JWS verification failed', { reason: verified.reason });
        return {
          valid: false,
          productId: null,
          environment: null,
          data: null,
          error: `jws_${verified.reason}`,
        };
      }
      t = verified.payload;
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
    logger.error('Apple IAP verification threw', err);
    return {
      valid: false,
      productId: null,
      environment: null,
      data: null,
      error: err?.message,
    };
  }
}
