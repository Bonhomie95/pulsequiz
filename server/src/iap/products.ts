/**
 * COIN_PACKS — single source of truth for every purchasable SKU.
 *
 * SKU naming convention (must match EXACTLY what you create in App Store Connect
 * and Google Play Console):
 *   pq_coins_500, pq_coins_1500, pq_coins_5000, pq_coins_12000, pq_coins_20000
 *
 * The server never trusts the client for price or coin amount — it always
 * looks up the pack here by SKU.
 */
export const COIN_PACKS = {
  pq_coins_500: { usd: 0.99, coins: 500, label: '500 Coins' },
  pq_coins_1500: { usd: 1.99, coins: 1500, label: '1,500 Coins' },
  pq_coins_5000: { usd: 4.99, coins: 5000, label: '5,000 Coins' },
  pq_coins_12000: { usd: 7.99, coins: 12000, label: '12,000 Coins' },
  pq_coins_20000: { usd: 9.99, coins: 20000, label: '20,000 Coins' },
} as const;

export type CoinSku = keyof typeof COIN_PACKS;
