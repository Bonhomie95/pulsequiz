export type PayoutCurrency = 'USDT' | 'USDC';
export type PayoutNetwork = 'TRC20' | 'ERC20' | 'BEP20' | 'POLYGON' | 'SOL';

/**
 * Networks we can actually pay out on, per stablecoin. Must match the tickers
 * in nowpaymentsService.getCurrency — USDC on Tron was discontinued by Circle,
 * and NOWPayments has no USDC-on-BSC ticker.
 */
export const PAYOUT_NETWORKS: Record<PayoutCurrency, readonly PayoutNetwork[]> = {
  USDT: ['TRC20', 'ERC20', 'BEP20'],
  USDC: ['ERC20', 'POLYGON', 'SOL'],
};

export const ALL_NETWORKS: readonly PayoutNetwork[] = ['TRC20', 'ERC20', 'BEP20', 'POLYGON', 'SOL'];

export function validateWalletAddress(network: PayoutNetwork, address: string): boolean {
  if (!address) return false;
  switch (network) {
    case 'TRC20':
      return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
    case 'ERC20':
    case 'BEP20':
    case 'POLYGON':
      return /^0x[a-fA-F0-9]{40}$/.test(address);
    case 'SOL':
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    default:
      return false;
  }
}

/** Kept for existing callers/tests: USDT-only networks. */
export function validateUsdtAddress(type: 'TRC20' | 'ERC20' | 'BEP20', address: string): boolean {
  return validateWalletAddress(type, address);
}

export function isSupportedPayout(currency: PayoutCurrency, network: PayoutNetwork): boolean {
  return PAYOUT_NETWORKS[currency]?.includes(network) ?? false;
}
