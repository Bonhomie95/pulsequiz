import axios from 'axios';

const BASE_URL = 'https://api.nowpayments.io/v1';
const API_KEY = process.env.NOWPAYMENTS_API_KEY || '';

// Currency mapping: TRC20 → usdttrc20, BEP20 → usdtbsc, ERC20 → usdte
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
  txHash?: string;
  error?: string;
}

export async function sendUSDT(params: {
  address: string;
  usdtType: string;
  amount: number;
  description: string;
}): Promise<PayoutResult> {
  if (!API_KEY) {
    console.warn('⚠️  NOWPAYMENTS_API_KEY not set — payout skipped (mock mode)');
    return {
      success: true,
      paymentId: `mock_${Date.now()}`,
      txHash: `mock_tx_${Date.now()}`,
    };
  }

  try {
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
            description: params.description,
          },
        ],
      },
      {
        headers: {
          'x-api-key': API_KEY,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const withdrawal = response.data?.withdrawals?.[0];

    return {
      success: true,
      paymentId: String(withdrawal?.id ?? response.data?.id ?? ''),
      txHash: withdrawal?.hash ?? undefined,
    };
  } catch (err: any) {
    const message =
      err?.response?.data?.message || err?.message || 'Unknown error';
    console.error('NOWPayments error:', message);
    return { success: false, error: message };
  }
}

export async function checkPayoutStatus(paymentId: string): Promise<{
  status: string;
  txHash?: string;
}> {
  if (!API_KEY || paymentId.startsWith('mock_')) {
    return { status: 'confirmed' };
  }

  try {
    const response = await axios.get(`${BASE_URL}/payout/${paymentId}`, {
      headers: { 'x-api-key': API_KEY },
    });
    return {
      status: response.data?.status ?? 'unknown',
      txHash: response.data?.hash,
    };
  } catch {
    return { status: 'unknown' };
  }
}
