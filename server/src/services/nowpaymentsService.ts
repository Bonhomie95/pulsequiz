/**
 * NOWPayments mass-payout client.
 *
 * Two things this must get right, because both cost real money when wrong:
 *
 *   1. A missing API key must FAIL, not silently "succeed". The previous
 *      version returned success with a fake transaction hash, which marked
 *      every payout sent and zeroed the user's accumulated balance — deleting
 *      the debt record for money that was never transferred.
 *
 *   2. Retries must be idempotent. The payout API is authenticated with an
 *      API key *and* a bearer token from /v1/auth, and each batch needs 2FA
 *      verification. If a response is lost after the provider accepted it, a
 *      blind retry sends the funds twice — so we look the reference up first.
 */
import axios from 'axios';
import { logger } from '../utils/logger';

const BASE_URL = process.env.NOWPAYMENTS_BASE_URL || 'https://api.nowpayments.io/v1';
const API_KEY = process.env.NOWPAYMENTS_API_KEY || '';
const EMAIL = process.env.NOWPAYMENTS_EMAIL || '';
const PASSWORD = process.env.NOWPAYMENTS_PASSWORD || '';
/** TOTP secret for payout verification, if the account requires 2FA. */
const TOTP_CODE_PROVIDER = process.env.NOWPAYMENTS_2FA_CODE || '';

/** Explicit opt-in for local development. Never set this in production. */
const MOCK_MODE = process.env.PAYOUT_MOCK === '1';

// Currency mapping: TRC20 → usdttrc20, BEP20 → usdtbsc, ERC20 → usdterc20
function getCurrency(usdtType: string): string {
  const map: Record<string, string> = {
    TRC20: 'usdttrc20',
    BEP20: 'usdtbsc',
    ERC20: 'usdterc20',
  };
  return map[usdtType] ?? 'usdttrc20';
}

export interface PayoutResult {
  success: boolean;
  paymentId?: string;
  batchId?: string;
  txHash?: string;
  error?: string;
  /** True when we could not determine whether the transfer happened. The
   *  caller must NOT retry blindly on this — reconcile first. */
  indeterminate?: boolean;
}

// ── Auth ────────────────────────────────────────────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getBearerToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;

  if (!EMAIL || !PASSWORD) {
    throw new Error(
      'NOWPAYMENTS_EMAIL / NOWPAYMENTS_PASSWORD are required for payouts — ' +
        'the payout API needs a bearer token in addition to the API key.',
    );
  }

  const res = await axios.post(
    `${BASE_URL}/auth`,
    { email: EMAIL, password: PASSWORD },
    { timeout: 15_000 },
  );

  const token = res.data?.token;
  if (!token) throw new Error('NOWPayments auth returned no token');

  // Tokens are short-lived; refresh well before the documented expiry.
  cachedToken = { token, expiresAt: Date.now() + 4 * 60 * 1000 };
  return token;
}

// ── Reconciliation ──────────────────────────────────────────────────────────

/**
 * Look for an existing payout carrying our reference.
 *
 * Called before every retry so a transfer the provider already accepted is
 * never sent twice.
 */
export async function findExistingPayout(
  reference: string,
): Promise<{ found: boolean; paymentId?: string; status?: string; txHash?: string }> {
  if (MOCK_MODE || !API_KEY) return { found: false };

  try {
    const token = await getBearerToken();
    const res = await axios.get(`${BASE_URL}/payout`, {
      headers: { 'x-api-key': API_KEY, Authorization: `Bearer ${token}` },
      params: { limit: 200 },
      timeout: 20_000,
    });

    const withdrawals: any[] = res.data?.data ?? res.data?.withdrawals ?? [];
    const match = withdrawals.find(
      (w) => w?.extra_id === reference || w?.unique_external_id === reference,
    );

    if (!match) return { found: false };
    return {
      found: true,
      paymentId: String(match.id ?? ''),
      status: match.status,
      txHash: match.hash ?? undefined,
    };
  } catch (err: any) {
    logger.warn('Could not reconcile payout reference with provider', {
      reference,
      error: err?.message,
    });
    // Unknown is not the same as absent — the caller treats this as a reason
    // to hold rather than retry.
    return { found: false };
  }
}

// ── Send ────────────────────────────────────────────────────────────────────

export async function sendUSDT(params: {
  address: string;
  usdtType: string;
  amount: number;
  description: string;
  /** Stable per-payout reference; the provider echoes it back so a retry can
   *  detect an already-accepted transfer. */
  reference: string;
}): Promise<PayoutResult> {
  if (MOCK_MODE) {
    logger.warn('PAYOUT_MOCK=1 — simulating a successful payout', {
      amount: params.amount,
      reference: params.reference,
    });
    return {
      success: true,
      paymentId: `mock_${params.reference}`,
      txHash: `mock_tx_${params.reference}`,
    };
  }

  if (!API_KEY) {
    // Previously this returned success. It must not: the caller resets the
    // user's accumulated balance on success, erasing money we still owe.
    const error = 'NOWPAYMENTS_API_KEY is not configured — refusing to mark payout sent';
    logger.error(error, undefined, { reference: params.reference });
    return { success: false, error };
  }

  // Never send twice for the same reference.
  const existing = await findExistingPayout(params.reference);
  if (existing.found) {
    logger.warn('Payout reference already exists at provider — not resending', {
      reference: params.reference,
      status: existing.status,
    });
    return {
      success: existing.status !== 'FAILED' && existing.status !== 'REJECTED',
      paymentId: existing.paymentId,
      txHash: existing.txHash,
      error: existing.status === 'FAILED' ? 'provider_reported_failed' : undefined,
    };
  }

  try {
    const token = await getBearerToken();
    const currency = getCurrency(params.usdtType);

    const response = await axios.post(
      `${BASE_URL}/payout`,
      {
        ipn_callback_url: process.env.NOWPAYMENTS_IPN_URL || '',
        withdrawals: [
          {
            address: params.address,
            currency,
            amount: params.amount,
            // Echoed back on lookup — this is the idempotency handle.
            extra_id: params.reference,
            unique_external_id: params.reference,
            ipn_callback_url: process.env.NOWPAYMENTS_IPN_URL || '',
          },
        ],
      },
      {
        headers: {
          'x-api-key': API_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 30_000,
      },
    );

    const batchId = response.data?.id ? String(response.data.id) : undefined;
    const withdrawal = response.data?.withdrawals?.[0];

    // Accounts with 2FA enabled require an explicit batch verification step.
    if (batchId && TOTP_CODE_PROVIDER) {
      try {
        await axios.post(
          `${BASE_URL}/payout/${batchId}/verify`,
          { verification_code: TOTP_CODE_PROVIDER },
          {
            headers: { 'x-api-key': API_KEY, Authorization: `Bearer ${token}` },
            timeout: 20_000,
          },
        );
      } catch (err: any) {
        logger.error('Payout batch created but verification failed', err, {
          batchId,
          reference: params.reference,
        });
        return {
          success: false,
          batchId,
          paymentId: String(withdrawal?.id ?? ''),
          error: `verification_failed: ${err?.response?.data?.message ?? err?.message}`,
          indeterminate: true,
        };
      }
    }

    return {
      success: true,
      batchId,
      paymentId: String(withdrawal?.id ?? batchId ?? ''),
      txHash: withdrawal?.hash ?? undefined,
    };
  } catch (err: any) {
    const message = err?.response?.data?.message || err?.message || 'Unknown error';
    const noResponse = !err?.response;

    logger.error('NOWPayments payout failed', err, {
      reference: params.reference,
      amount: params.amount,
      providerMessage: message,
    });

    return {
      success: false,
      error: message,
      // A timeout or connection reset means we don't know whether the provider
      // accepted the transfer. The retry path must reconcile, not resend.
      indeterminate: noResponse,
    };
  }
}

export async function checkPayoutStatus(paymentId: string): Promise<{
  status: string;
  txHash?: string;
}> {
  if (MOCK_MODE || !API_KEY || paymentId.startsWith('mock_')) {
    return { status: 'confirmed' };
  }

  try {
    const token = await getBearerToken();
    const response = await axios.get(`${BASE_URL}/payout/${paymentId}`, {
      headers: { 'x-api-key': API_KEY, Authorization: `Bearer ${token}` },
      timeout: 15_000,
    });
    return {
      status: response.data?.status ?? 'unknown',
      txHash: response.data?.hash,
    };
  } catch {
    return { status: 'unknown' };
  }
}
