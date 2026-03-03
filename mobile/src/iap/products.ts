import { Platform } from 'react-native';

export type CoinProduct = {
  sku: string;
  coins: number;
  priceLabel: string;  // fallback — overridden by store price at runtime
  popular?: boolean;
  bonus?: boolean;
  bonusLabel?: string;
};

export const COIN_PRODUCTS: CoinProduct[] = [
  {
    sku: 'pq_coins_500',
    coins: 500,
    priceLabel: '$0.99',
  },
  {
    sku: 'pq_coins_1500',
    coins: 1500,
    priceLabel: '$1.99',
    popular: true,
  },
  {
    sku: 'pq_coins_5000',
    coins: 5000,
    priceLabel: '$4.99',
    bonus: true,
    bonusLabel: '+500 bonus',
  },
  {
    sku: 'pq_coins_12000',
    coins: 12000,
    priceLabel: '$7.99',
    bonus: true,
    bonusLabel: '+2,000 bonus',
  },
  {
    sku: 'pq_coins_20000',
    coins: 20000,
    priceLabel: '$9.99',
    bonus: true,
    bonusLabel: '+5,000 bonus',
  },
];

// All SKUs in one array — passed to IAP.getProducts()
export const ALL_SKUS = COIN_PRODUCTS.map((p) => p.sku);
