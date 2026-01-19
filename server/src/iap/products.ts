export const COIN_PACKS = {
  pq_coins_500: { usd: 1, coins: 500 },
  pq_coins_1500: { usd: 2, coins: 1500 },
  pq_coins_5000: { usd: 5, coins: 5000 },
  pq_coins_12000: { usd: 7.5, coins: 12000 },
  pq_coins_20000: { usd: 10, coins: 20000 },
} as const;

export type CoinSku = keyof typeof COIN_PACKS;
