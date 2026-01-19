import { Platform } from 'react-native';

export const COIN_PRODUCTS = [
  {
    sku: Platform.select({
      ios: 'pq_coins_500',
      android: 'pq_coins_500',
    })!,
    coins: 500,
    priceLabel: '$1',
  },
  {
    sku: Platform.select({
      ios: 'pq_coins_1500',
      android: 'pq_coins_1500',
    })!,
    coins: 1500,
    priceLabel: '$2',
    popular: true,
  },
  {
    sku: Platform.select({
      ios: 'pq_coins_5000',
      android: 'pq_coins_5000',
    })!,
    coins: 5000,
    priceLabel: '$5',
  },
  {
    sku: Platform.select({
      ios: 'pq_coins_12000',
      android: 'pq_coins_12000',
    })!,
    coins: 12000,
    priceLabel: '$7.5',
    bonus: true,
  },
  {
    sku: Platform.select({
      ios: 'pq_coins_20000',
      android: 'pq_coins_20000',
    })!,
    coins: 20000,
    priceLabel: '$10',
  },
];
