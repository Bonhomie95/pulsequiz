/**
 * AdMob server-side verification (SSV).
 *
 * Google signs each rewarded-ad completion and calls our endpoint directly.
 * That callback — not the mobile client — is the only thing allowed to mint
 * coins. Previously any holder of a valid session token could POST
 * /api/ads/reward on a loop and mint currency indefinitely.
 *
 * Verification procedure (per Google's documentation):
 *   1. The signed content is the raw query string up to, but excluding,
 *      "&signature=".
 *   2. `signature` and `key_id` are the last two parameters, in that order.
 *   3. Look up `key_id` in Google's published key set and verify the
 *      ECDSA-SHA256 signature (base64url encoded) against it.
 */
import crypto from 'crypto';
import axios from 'axios';
import { logger } from '../utils/logger';

const KEY_SERVER_URL =
  process.env.ADMOB_SSV_KEY_URL ||
  'https://www.gstatic.com/admob/reward/verifier-keys.json';

/** Reject callbacks older than this to bound replay attempts. */
const MAX_CALLBACK_AGE_MS = 60 * 60 * 1000;

interface VerifierKey {
  keyId: number;
  pem: string;
  base64: string;
}

let keyCache: { keys: Map<string, string>; fetchedAt: number } | null = null;
const KEY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function getVerifierKeys(): Promise<Map<string, string>> {
  if (keyCache && Date.now() - keyCache.fetchedAt < KEY_CACHE_TTL_MS) {
    return keyCache.keys;
  }

  const res = await axios.get<{ keys: VerifierKey[] }>(KEY_SERVER_URL, {
    timeout: 10_000,
  });

  const keys = new Map<string, string>();
  for (const k of res.data?.keys ?? []) {
    if (k.keyId != null && k.pem) keys.set(String(k.keyId), k.pem);
  }
  if (!keys.size) throw new Error('AdMob verifier key set was empty');

  keyCache = { keys, fetchedAt: Date.now() };
  return keys;
}

export type SsvResult =
  | {
      valid: true;
      userId: string;
      transactionId: string;
      adUnit?: string;
      adNetwork?: string;
      rewardAmount?: number;
      rewardItem?: string;
      customData?: string;
    }
  | { valid: false; reason: string };

/**
 * @param rawQuery the request's query string exactly as received, without the
 *                 leading "?" (Express exposes this as `req.originalUrl`'s tail).
 */
export async function verifyAdmobSsv(
  rawQuery: string,
  params: Record<string, string | undefined>,
): Promise<SsvResult> {
  const { signature, key_id: keyId, user_id: userId, transaction_id: transactionId } = params;

  if (!signature) return { valid: false, reason: 'missing_signature' };
  if (!keyId) return { valid: false, reason: 'missing_key_id' };
  if (!userId) return { valid: false, reason: 'missing_user_id' };
  if (!transactionId) return { valid: false, reason: 'missing_transaction_id' };

  // The signed content is everything before "&signature=".
  const sigIndex = rawQuery.indexOf('&signature=');
  if (sigIndex === -1) return { valid: false, reason: 'malformed_query' };
  const signedContent = rawQuery.substring(0, sigIndex);

  let keys: Map<string, string>;
  try {
    keys = await getVerifierKeys();
  } catch (err) {
    logger.error('Could not fetch AdMob verifier keys', err);
    return { valid: false, reason: 'key_fetch_failed' };
  }

  const pem = keys.get(String(keyId));
  if (!pem) {
    // A rotated key we haven't cached — drop the cache and retry once.
    keyCache = null;
    const refreshed = await getVerifierKeys().catch(() => null);
    const retryPem = refreshed?.get(String(keyId));
    if (!retryPem) return { valid: false, reason: 'unknown_key_id' };
    return verifyWithPem(retryPem, signedContent, signature, params);
  }

  return verifyWithPem(pem, signedContent, signature, params);
}

function verifyWithPem(
  pem: string,
  signedContent: string,
  signature: string,
  params: Record<string, string | undefined>,
): SsvResult {
  let ok = false;
  try {
    const verifier = crypto.createVerify('SHA256');
    verifier.update(signedContent);
    verifier.end();
    ok = verifier.verify(pem, Buffer.from(signature, 'base64url'));
  } catch (err) {
    logger.warn('AdMob SSV signature verification threw', {
      error: (err as Error).message,
    });
    return { valid: false, reason: 'verify_error' };
  }

  if (!ok) return { valid: false, reason: 'bad_signature' };

  // A valid but stale signature is still a replay vector, so bound the age.
  const timestampMs = Number(params.timestamp);
  if (Number.isFinite(timestampMs)) {
    const age = Date.now() - timestampMs;
    if (age > MAX_CALLBACK_AGE_MS) return { valid: false, reason: 'stale_callback' };
  }

  const rewardAmount = Number(params.reward_amount);

  return {
    valid: true,
    userId: params.user_id as string,
    transactionId: params.transaction_id as string,
    adUnit: params.ad_unit,
    adNetwork: params.ad_network,
    rewardAmount: Number.isFinite(rewardAmount) ? rewardAmount : undefined,
    rewardItem: params.reward_item,
    customData: params.custom_data,
  };
}

/** Whether SSV enforcement is switched on. */
export function isSsvEnabled(): boolean {
  return process.env.ADMOB_SSV_ENABLED === '1';
}
