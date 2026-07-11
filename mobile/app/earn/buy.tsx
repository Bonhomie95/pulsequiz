import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as IAP from 'react-native-iap';
import { ErrorCode } from 'react-native-iap';
import type { Purchase, PurchaseError } from 'react-native-iap';
import { ChevronLeft, ShoppingBag } from 'lucide-react-native';

import { useTheme } from '@/src/theme/useTheme';
import { COIN_PRODUCTS } from '@/src/iap/products';
import { api } from '@/src/api/api';
import { useCoinStore } from '@/src/store/useCoinStore';
import { useRouter } from 'expo-router';

// Prefer the server's authoritative total (`coins`) so the local balance can't
// drift; fall back to adding the delta only if an older server omits it.
function syncCoins(data: { coins?: number; coinsAdded?: number }) {
  if (typeof data?.coins === 'number') {
    useCoinStore.getState().setCoins(data.coins);
  } else if (typeof data?.coinsAdded === 'number') {
    useCoinStore.getState().addCoins(data.coinsAdded);
  }
}

export default function BuyCoinsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [loadingSku, setLoadingSku] = useState<string | null>(null);
  const [storePrices, setStorePrices] = useState<Record<string, string>>({});

  // ── Init & fetch product metadata ─────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        await IAP.initConnection();
        const skus = COIN_PRODUCTS.map((p) => p.sku);
        const products = await IAP.fetchProducts({ skus, type: 'in-app' });
        if (!mounted) return;
        const prices: Record<string, string> = {};
        for (const p of products ?? []) {
          prices[p.id] = p.displayPrice;
        }
        setStorePrices(prices);
      } catch (e) {
        console.warn('[IAP] init/fetch error:', e);
      }
    })();

    return () => {
      mounted = false;
      IAP.endConnection();
    };
  }, []);

  // ── Purchase listeners ────────────────────────────────────────────────────
  useEffect(() => {
    const purchaseSub = IAP.purchaseUpdatedListener(
      async (purchase: Purchase) => {
        try {
          if (Platform.OS === 'ios') {
            if (!purchase.transactionId) throw new Error('Missing transaction ID');
            const res = await api.post('/purchase/apple/verify', {
              sku: purchase.productId,
              transactionId: purchase.transactionId,
            });
            await IAP.finishTransaction({ purchase, isConsumable: true });
            syncCoins(res.data);
            Alert.alert(
              '🎉 Success',
              `${res.data.coinsAdded} coins added to your account!`,
            );
            router.back();
          }

          if (Platform.OS === 'android') {
            if (!purchase.purchaseToken) throw new Error('Invalid Android purchase');
            const res = await api.post('/purchase/google/verify', {
              sku: purchase.productId,
              purchaseToken: purchase.purchaseToken,
              packageName: (purchase as IAP.PurchaseAndroid).packageNameAndroid,
            });
            await IAP.finishTransaction({ purchase, isConsumable: true });
            syncCoins(res.data);
            Alert.alert(
              '🎉 Success',
              `${res.data.coinsAdded} coins added to your account!`,
            );
            router.back();
          }
        } catch (e: any) {
          Alert.alert(
            'Purchase failed',
            e?.message || 'Something went wrong. Please contact support.',
          );
        } finally {
          setLoadingSku(null);
        }
      },
    );

    const errorSub = IAP.purchaseErrorListener((error: PurchaseError) => {
      if (error.code !== ErrorCode.UserCancelled) {
        Alert.alert('Purchase failed', error.message || 'Something went wrong');
      }
      setLoadingSku(null);
    });

    return () => {
      purchaseSub.remove();
      errorSub.remove();
    };
  }, []);

  // ── Initiate purchase ─────────────────────────────────────────────────────
  const buy = (sku: string) => {
    if (loadingSku) return;
    setLoadingSku(sku);
    // requestPurchase does NOT return the purchase — result arrives via listener
    IAP.requestPurchase({
      type: 'in-app',
      request: {
        apple: { sku, andDangerouslyFinishTransactionAutomatically: false },
        google: { skus: [sku] },
      },
    }).catch((e: PurchaseError) => {
      if (e.code !== ErrorCode.UserCancelled) {
        Alert.alert('Purchase failed', e.message || 'Something went wrong');
      }
      setLoadingSku(null);
    });
  };

  const restorePurchases = async () => {
    try {
      const res = await api.post('/purchase/apple/restore');
      useCoinStore.getState().setCoins(res.data.coins);
      Alert.alert('Restored', 'Your purchases were restored.');
    } catch {
      Alert.alert('Restore failed', 'Could not restore purchases.');
    }
  };

  const getPrice = (sku: string) =>
    storePrices[sku] ||
    COIN_PRODUCTS.find((p) => p.sku === sku)?.priceLabel ||
    '';

  // ── UI ────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView
      edges={['top']}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: theme.colors.surface }]}
        >
          <ChevronLeft size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Buy Coins
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { backgroundColor: theme.colors.surface }]}>
          <ShoppingBag size={36} color={theme.colors.primary} />
          <Text style={[styles.heroTitle, { color: theme.colors.text }]}>
            Get More Coins
          </Text>
          <Text style={[styles.heroSub, { color: theme.colors.muted }]}>
            Use coins for hints, wagers, and boosts. One-time purchases, no
            subscription.
          </Text>
        </View>

        {COIN_PRODUCTS.map((p) => (
          <TouchableOpacity
            key={p.sku}
            onPress={() => buy(p.sku)}
            disabled={!!loadingSku}
            style={[
              styles.card,
              {
                backgroundColor: p.popular
                  ? theme.colors.primary
                  : theme.colors.surface,
                borderWidth: p.popular ? 0 : 1,
                borderColor: theme.colors.border,
              },
            ]}
          >
            {p.popular && (
              <View style={styles.popularBadge}>
                <Text style={styles.popularText}>BEST VALUE 🔥</Text>
              </View>
            )}
            <View>
              <Text
                style={{
                  color: p.popular ? '#fff' : theme.colors.text,
                  fontWeight: '800',
                  fontSize: 18,
                }}
              >
                🪙 {p.coins.toLocaleString()} coins
              </Text>
              {p.bonus && (
                <Text
                  style={{
                    color: p.popular ? '#ffffffcc' : theme.colors.muted,
                    fontSize: 12,
                    marginTop: 2,
                  }}
                >
                  Includes bonus coins
                </Text>
              )}
            </View>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <Text
                style={{
                  color: p.popular ? '#fff' : theme.colors.text,
                  fontWeight: '800',
                  fontSize: 16,
                }}
              >
                {getPrice(p.sku)}
              </Text>
              {loadingSku === p.sku && (
                <ActivityIndicator
                  size="small"
                  color={p.popular ? '#fff' : theme.colors.primary}
                />
              )}
            </View>
          </TouchableOpacity>
        ))}

        {Platform.OS === 'ios' && (
          <TouchableOpacity
            onPress={restorePurchases}
            style={{ marginTop: 8, padding: 16 }}
          >
            <Text
              style={{
                color: theme.colors.primary,
                textAlign: 'center',
                fontWeight: '600',
              }}
            >
              Restore Purchases
            </Text>
          </TouchableOpacity>
        )}

        <Text style={[styles.note, { color: theme.colors.muted }]}>
          Purchases are processed securely via the App Store / Play Store. Coins
          are non-refundable.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { fontSize: 20, fontWeight: '800' },
  scroll: { padding: 16, paddingBottom: 60 },
  hero: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  heroTitle: { fontSize: 20, fontWeight: '900' },
  heroSub: { textAlign: 'center', fontSize: 13, lineHeight: 20 },
  card: {
    padding: 18,
    borderRadius: 18,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    backgroundColor: '#FFB800',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  popularText: { color: '#000', fontWeight: '800', fontSize: 10 },
  note: { textAlign: 'center', fontSize: 11, lineHeight: 17, marginTop: 16 },
});
