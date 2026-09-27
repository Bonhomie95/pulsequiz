/**
 * What the in-app currency is called.
 *
 * One place, because it appears in a couple of dozen strings and a rename
 * that misses half of them reads worse than no rename at all. This is the
 * soft currency earned and staked in-app — not the USDC prize payout, which
 * is real money and must never be described in these terms.
 */
export const COIN_NAME = {
  singular: 'PulseCoin',
  plural: 'PulseCoins',
  /** For tight spaces — a row label, a pill, a header. */
  short: 'PC',
} as const;
