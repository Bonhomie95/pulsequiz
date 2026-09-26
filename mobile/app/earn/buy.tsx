import { useEffect, useRef, useState } from 'react';
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
import { COIN_PRODUCTS, ALL_SKUS as COIN_SKUS } from '@/src/iap/products';
import { errorMessage } from '@/src/api/api';
import { verifyAndFinish, reconcilePendingPurchases } from '@/src/iap/verify';
import { useRouter } from 'expo-router';
import { logger } from '@/src/utils/logger';

export default function BuyCoinsScreen() {
  // Purchases already handled this session, so a re-fired listener doesn't
  // stack duplicate alerts on top of an idempotent server call.
  const handledPurchases = useRef<Set<string>>(new Set());
  const theme = useTheme();
  const router = useRouter();
  const [loadingSku, setLoadingSku] = useState<string | null>(null);
  const [storePrices, setStorePrices] = useState<Record<string, string>>({});
  const [storeError, setStoreError] = useState(false);

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
        logger.warn('Coin IAP init failed', { error: String(e) });
        if (mounted) setStoreError(true);
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
        // The listener can fire more than once for the same purchase (relaunch,
        // a retried finishTransaction). The server is idempotent, but without
        // this the user gets a stack of duplicate success alerts.
        // Subscriptions are handled by the Premium screen.
        if (!COIN_SKUS.includes(purchase.productId)) return;
        const key = purchase.transactionId ?? purchase.purchaseToken ?? '';
        if (!key || handledPurchases.current.has(key)) return;
        handledPurchases.current.add(key);

        try {
          const result = await verifyAndFinish(purchase);
          if (result?.kind !== 'coins') return; // a subscription — not ours

          const added = result.coinsAdded;
          Alert.alert(
            '🎉 Success',
            added > 0
              ? `${added.toLocaleString()} coins added to your account!`
              : // The server replays an already-credited purchase with
                // coinsAdded: 0. Saying "0 coins added" to someone who just
                // paid reads as a failure.
                'This purchase was already credited — your coins are in your wallet.',
          );
          router.back();
        } catch (e: any) {
          handledPurchases.current.delete(key); // allow a genuine retry

          const status = e?.response?.status;
          logger.error('Coin purchase verification failed', e, {
            sku: purchase.productId,
            status,
          });

          // A 4xx is the store or the server rejecting the receipt — that
          // will not fix itself. Anything else (offline, 5xx) is retried
          // automatically the next time the app opens (reconcilePendingPurchases),
          // because we have not consumed the transaction.
          const terminal = typeof status === 'number' && status >= 400 && status < 500;

          Alert.alert(
            terminal ? 'Purchase could not be verified' : 'Almost there',
            terminal
              ? errorMessage(
                  e,
                  'Your payment was not accepted. You have not been charged for coins. Contact support if you were.',
                )
              : "We couldn't reach PulseQuiz to confirm your purchase. It is safe — your coins will be added automatically next time you open the app.",
          );
        } finally {
          setLoadingSku(null);
        }
      },
    );

    const errorSub = IAP.purchaseErrorListener((error: PurchaseError) => {
      if (error.code !== ErrorCode.UserCancelled) {
        logger.warn('Store purchase error', { code: error.code });
        Alert.alert(
          'Purchase failed',
          error.message || "The store couldn't complete that purchase.",
        );
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

  // Coins are consumable, so there is nothing to "restore" — but a payment
  // that never reached our server (app killed, offline) can be completed.
  const [checkingPending, setCheckingPending] = useState(false);
  const checkPending = async () => {
    if (checkingPending) return;
    setCheckingPending(true);
    try {
      const n = await reconcilePendingPurchases();
      Alert.alert(
        n > 0 ? 'Purchases completed' : 'All up to date',
        n > 0
          ? 'Your pending purchase has been credited to your wallet.'
          : 'There are no unfinished purchases on this store account.',
      );
    } finally {
      setCheckingPending(false);
    }
  };

  // Store price only. Selling at a hardcoded USD label would show the wrong
  // price to most of the world.
  const getPrice = (sku: string) => storePrices[sku] ?? null;
  const pricesLoaded = Object.keys(storePrices).length > 0;

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
        
            accessibilityRole="button"
            hitSlop={8}
            accessibilityLabel="Go back">
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

        {!pricesLoaded && (
          <Text style={[styles.note, { color: theme.colors.muted, marginBottom: 12 }]}>
            {storeError ? 'The store is unavailable right now. Please try again later.' : 'Loading prices…'}
          </Text>
        )}

        {COIN_PRODUCTS.map((p) => (
          <TouchableOpacity
            key={p.sku}
            onPress={() => buy(p.sku)}
            disabled={!!loadingSku || !getPrice(p.sku)}
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
          
            accessibilityRole="button"
            accessibilityLabel={`Buy ${p.coins.toLocaleString()} coins${getPrice(p.sku) ? ` for ${getPrice(p.sku)}` : ''}`}
            accessibilityState={{ disabled: !!loadingSku || !getPrice(p.sku), busy: loadingSku === p.sku }}
            hitSlop={8}>
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
                {getPrice(p.sku) ?? '—'}
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

        <TouchableOpacity
          onPress={checkPending}
          disabled={checkingPending}
          style={{ marginTop: 8, padding: 16 }}
          accessibilityRole="button"
          accessibilityLabel="Complete pending purchases"
          accessibilityState={{ disabled: checkingPending, busy: checkingPending }}
          hitSlop={8}>
          {checkingPending ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            <Text
              style={{
                color: theme.colors.primary,
                textAlign: 'center',
                fontWeight: '600',
              }}
            >
              {"Paid but didn't receive coins? Tap to complete"}
            </Text>
          )}
        </TouchableOpacity>

        <Text style={[styles.note, { color: theme.colors.muted }]}>
          Payments are processed by the {Platform.OS === 'ios' ? 'App Store' : 'Google Play Store'}.
          Coins are a virtual item with no cash value, are not prize money, and
          cannot be exchanged for USDT/USDC. Refund requests are handled by the{' '}
          {Platform.OS === 'ios' ? 'App Store' : 'Google Play Store'}.
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
