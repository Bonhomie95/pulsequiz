import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as IAP from 'react-native-iap';
import type { Purchase, PurchaseAndroid, PurchaseIOS } from 'react-native-iap';

import { useTheme } from '@/src/theme/useTheme';
import { COIN_PRODUCTS } from '@/src/iap/products';
import { api } from '@/src/api/api';
import { useCoinStore } from '@/src/store/useCoinStore';
import { useRouter } from 'expo-router';

/* ---------------- UTIL ---------------- */

function normalizePurchase(
  result: Purchase | Purchase[] | null,
): Purchase | null {
  if (!result) return null;
  return Array.isArray(result) ? result[0] ?? null : result;
}

/* ---------------- SCREEN ---------------- */

export default function BuyCoinsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [loadingSku, setLoadingSku] = useState<string | null>(null);

  /* ---------------- INIT IAP ---------------- */

  useEffect(() => {
    IAP.initConnection();

    return () => {
      IAP.endConnection();
    };
  }, []);

  /* ---------------- LOAD STORE PRODUCTS ---------------- */

  useEffect(() => {
    (async () => {
      try {
        const skus = COIN_PRODUCTS.map((p) => p.sku);
        await IAP.fetchProducts({ skus });
      } catch (e) {
        console.warn('Failed to fetch products', e);
      }
    })();
  }, []);

  /* ---------------- ANDROID PENDING HANDLER ---------------- */

  useEffect(() => {
    const sub = IAP.purchaseUpdatedListener(async (purchase) => {
      if (
        Platform.OS === 'android' &&
        !purchase.isAcknowledgedAndroid
      ) {
        Alert.alert(
          'Purchase pending',
          'Your purchase is pending approval. Coins will be credited once confirmed.',
        );
      }
    });

    return () => sub.remove();
  }, []);

  /* ---------------- BUY ---------------- */

  const buy = async (sku: string) => {
    if (loadingSku) return;

    try {
      setLoadingSku(sku);

      const result = await IAP.requestPurchase({
        sku,
        andDangerouslyFinishTransactionAutomaticallyIOS: false,
      });

      const purchase = normalizePurchase(result);
      if (!purchase) throw new Error('Purchase cancelled');

      /* -------- iOS -------- */
      if (Platform.OS === 'ios') {
        const p = purchase as PurchaseIOS;

        if (!p.transactionId) {
          throw new Error('Missing transaction ID');
        }

        const res = await api.post('/purchase/apple/verify', {
          sku,
          transactionId: p.transactionId,
        });

        useCoinStore.getState().addCoins(res.data.coinsAdded);
        await IAP.finishTransaction({ purchase });
        router.back();
        return;
      }

      /* -------- ANDROID -------- */
      if (Platform.OS === 'android') {
        const p = purchase as PurchaseAndroid;

        if (!p.purchaseToken || !p.packageNameAndroid) {
          throw new Error('Invalid Android purchase');
        }

        const res = await api.post('/purchase/google/verify', {
          sku,
          purchaseToken: p.purchaseToken,
          packageName: p.packageNameAndroid,
        });

        useCoinStore.getState().addCoins(res.data.coinsAdded);
        await IAP.finishTransaction({ purchase });
        router.back();
      }
    } catch (e: any) {
      console.warn('Purchase failed', e);
      Alert.alert('Purchase failed', e?.message || 'Something went wrong');
    } finally {
      setLoadingSku(null);
    }
  };

  /* ---------------- RESTORE (iOS) ---------------- */

  const restorePurchases = async () => {
    try {
      const res = await api.post('/purchase/apple/restore');
      useCoinStore.getState().setCoins(res.data.restoredCoins);
      Alert.alert('Restored', 'Your purchases were restored.');
    } catch {
      Alert.alert('Restore failed', 'Could not restore purchases.');
    }
  };

  /* ---------------- UI ---------------- */

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={styles.container}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Buy Coins
        </Text>

        <Text style={{ color: theme.colors.muted, marginBottom: 16 }}>
          Get more coins instantly
        </Text>

        {COIN_PRODUCTS.map((p) => (
          <TouchableOpacity
            key={p.sku}
            onPress={() => buy(p.sku)}
            disabled={loadingSku === p.sku}
            style={[
              styles.card,
              {
                backgroundColor: p.popular
                  ? theme.colors.primary
                  : theme.colors.surface,
              },
            ]}
          >
            <View>
              <Text
                style={{
                  color: p.popular ? '#fff' : theme.colors.text,
                  fontWeight: '800',
                  fontSize: 16,
                }}
              >
                {p.coins.toLocaleString()} coins
              </Text>

              {p.bonus && (
                <Text style={{ color: '#22c55e', fontSize: 12 }}>
                  Best value 🔥
                </Text>
              )}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text
                style={{
                  color: p.popular ? '#fff' : theme.colors.text,
                  fontWeight: '700',
                }}
              >
                {p.priceLabel}
              </Text>

              {loadingSku === p.sku && (
                <ActivityIndicator size="small" color="#fff" />
              )}
            </View>
          </TouchableOpacity>
        ))}

        {Platform.OS === 'ios' && (
          <TouchableOpacity
            onPress={restorePurchases}
            style={{ marginTop: 16 }}
          >
            <Text style={{ color: theme.colors.primary, textAlign: 'center' }}>
              Restore Purchases
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  container: { padding: 20 },
  title: {
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 4,
  },
  card: {
    padding: 18,
    borderRadius: 18,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
