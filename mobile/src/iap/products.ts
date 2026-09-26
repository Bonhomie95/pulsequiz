export type CoinProduct = {
  sku: string;
  coins: number;
  popular?: boolean;
  bonus?: boolean;
  bonusLabel?: string;
};

export const COIN_PRODUCTS: CoinProduct[] = [
  {
    sku: 'pq_coins_500',
    coins: 500,
  },
  {
    sku: 'pq_coins_1500',
    coins: 1500,
    popular: true,
  },
  {
    sku: 'pq_coins_5000',
    coins: 5000,
    bonus: true,
    bonusLabel: '+500 bonus',
  },
  {
    sku: 'pq_coins_12000',
    coins: 12000,
    bonus: true,
    bonusLabel: '+2,000 bonus',
  },
  {
    sku: 'pq_coins_20000',
    coins: 20000,
    bonus: true,
    bonusLabel: '+5,000 bonus',
  },
];

// All coin SKUs — must match server/src/iap/products.ts
export const ALL_SKUS = COIN_PRODUCTS.map((p) => p.sku);
