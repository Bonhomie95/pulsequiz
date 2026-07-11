import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as IAP from 'react-native-iap';
import { ErrorCode } from 'react-native-iap';
import type { Purchase, PurchaseError } from 'react-native-iap';
import { ChevronLeft, Crown, Check } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { useTheme } from '@/src/theme/useTheme';
import { api } from '@/src/api/api';
import { usePremiumStore } from '@/src/store/usePremiumStore';

// ─── Plan definitions ─────────────────────────────────────────────────────────

type PlanMeta = {
  sku: string;
  label: string;
  perMonth: string;
  badge?: string;
  highlighted?: boolean;
};

const PLANS: PlanMeta[] = [
  { sku: 'pq_premium_monthly', label: 'Monthly', perMonth: '~$2.99/mo' },
  {
    sku: 'pq_premium_3month',
    label: '3 Months',
    perMonth: '~$2.66/mo',
    badge: 'Save 11%',
  },
  {
    sku: 'pq_premium_6month',
    label: '6 Months',
    perMonth: '~$2.33/mo',
    badge: 'Save 22%',
    highlighted: true,
  },
  {
    sku: 'pq_premium_yearly',
    label: '12 Months',
    perMonth: '~$2.08/mo',
    badge: '🔥 Best Value',
  },
];

const ALL_SKUS = PLANS.map((p) => p.sku);

const PERKS = [
  { icon: '🚫', text: 'No banner ads' },
  { icon: '🚫', text: 'No interstitial ads' },
  { icon: '✅', text: 'Rewarded ads still available for bonus coins' },
  { icon: '💙', text: 'Support indie development' },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PremiumScreen() {
  const theme = useTheme();
  const router = useRouter();
  const {
    isPremium,
    expiresAt,
    plan: activePlan,
    setPremium,
  } = usePremiumStore();

  const [storePrices, setStorePrices] = useState<Record<string, string>>({});
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [selectedSku, setSelectedSku] = useState('pq_premium_yearly');
  const [loadingSku, setLoadingSku] = useState<string | null>(null);

  // Which SKU triggered the active purchase, so the listener can match it
  const pendingSkuRef = useRef<string | null>(null);

  // ── Init + load subscription prices ──────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        await IAP.initConnection();
        const subs = await IAP.fetchProducts({ skus: ALL_SKUS, type: 'subs' });
        if (!mounted) return;
        const prices: Record<string, string> = {};
        for (const s of subs ?? []) {
          prices[s.id] = s.displayPrice;
        }
        setStorePrices(prices);
      } catch (e) {
        console.warn('[PremiumIAP] init/fetch error:', e);
      } finally {
        if (mounted) setLoadingPrices(false);
      }
    })();

    return () => {
      mounted = false;
      IAP.endConnection();
    };
  }, []);

  // ── Purchase listeners ─────────────────────────────────────────────────────
  useEffect(() => {
    const purchaseSub = IAP.purchaseUpdatedListener(
      async (purchase: Purchase) => {
        const sku = pendingSkuRef.current ?? purchase.productId;

        // Ignore if not from this screen
        if (!ALL_SKUS.includes(purchase.productId)) return;

        pendingSkuRef.current = null;

        try {
          if (Platform.OS === 'ios') {
            if (!purchase.transactionId)
              throw new Error('Missing transaction ID');
            const res = await api.post('/subscription/apple/verify', {
              sku,
              transactionId: purchase.transactionId,
              originalTransactionId: (purchase as IAP.PurchaseIOS)
                .originalTransactionIdentifierIOS,
            });
            await IAP.finishTransaction({ purchase, isConsumable: false });
            setPremium({
              isPremium: true,
              expiresAt: res.data.expiresAt,
              plan: sku,
            });
            Alert.alert(
              '🎉 Premium Activated!',
              'Enjoy your ad-free experience!',
            );
            router.back();
          }

          if (Platform.OS === 'android') {
            if (!purchase.purchaseToken)
              throw new Error('Invalid Android purchase');
            const res = await api.post('/subscription/google/verify', {
              sku,
              purchaseToken: purchase.purchaseToken,
              packageName: (purchase as IAP.PurchaseAndroid).packageNameAndroid,
            });
            await IAP.finishTransaction({ purchase, isConsumable: false });
            setPremium({
              isPremium: true,
              expiresAt: res.data.expiresAt,
              plan: sku,
            });
            Alert.alert(
              '🎉 Premium Activated!',
              'Enjoy your ad-free experience!',
            );
            router.back();
          }
        } catch (e: any) {
          Alert.alert(
            'Verification failed',
            'Your payment was received but verification failed. Please contact support.',
          );
        } finally {
          setLoadingSku(null);
        }
      },
    );

    const errorSub = IAP.purchaseErrorListener((error: PurchaseError) => {
      if (error.code !== ErrorCode.UserCancelled) {
        Alert.alert('Purchase failed', error.message ?? 'Please try again.');
      }
      setLoadingSku(null);
      pendingSkuRef.current = null;
    });

    return () => {
      purchaseSub.remove();
      errorSub.remove();
    };
  }, []);

  // ── Initiate subscription ─────────────────────────────────────────────────
  const subscribe = (sku: string) => {
    if (loadingSku) return;
    setLoadingSku(sku);
    pendingSkuRef.current = sku;

    // requestPurchase — result arrives via purchaseUpdatedListener
    IAP.requestPurchase({
      type: 'subs',
      request: {
        apple: { sku, andDangerouslyFinishTransactionAutomatically: false },
        google: { skus: [sku] },
      },
    }).catch((e: PurchaseError) => {
      if (e.code !== ErrorCode.UserCancelled) {
        Alert.alert(
          'Could not start purchase',
          e.message ?? 'Please try again.',
        );
      }
      setLoadingSku(null);
      pendingSkuRef.current = null;
    });
  };

  // ── Restore purchases (iOS App Store requirement) ─────────────────────────
  const restore = async () => {
    try {
      // Server-side restore first (fastest path)
      const res = await api
        .post('/subscription/apple/restore')
        .catch(() => null);
      if (res?.data?.isPremium) {
        setPremium({
          isPremium: true,
          expiresAt: res.data.expiresAt,
          plan: res.data.plan,
        });
        Alert.alert('Restored!', 'Your subscription has been restored.');
        router.back();
        return;
      }

      // Fallback: query the App Store directly
      const purchases = await IAP.getAvailablePurchases();
      const subPurchase = purchases.find((p) =>
        ALL_SKUS.includes(p.productId),
      );
      if (subPurchase) {
        const res2 = await api.post('/subscription/apple/verify', {
          sku: subPurchase.productId,
          transactionId: subPurchase.transactionId,
          originalTransactionId: (subPurchase as IAP.PurchaseIOS)
            .originalTransactionIdentifierIOS,
        });
        await IAP.finishTransaction({
          purchase: subPurchase,
          isConsumable: false,
        });
        setPremium({
          isPremium: true,
          expiresAt: res2.data.expiresAt,
          plan: subPurchase.productId,
        });
        Alert.alert('Restored!', 'Your subscription has been restored.');
        router.back();
      } else {
        Alert.alert(
          'No subscription found',
          'No active subscription found on this account.',
        );
      }
    } catch {
      Alert.alert('Restore failed', 'Please try again later.');
    }
  };

  const getPrice = (sku: string) =>
    storePrices[sku] || PLANS.find((p) => p.sku === sku)?.perMonth || '—';

  // ── Already premium — show status ─────────────────────────────────────────
  if (isPremium) {
    const exp = expiresAt ? new Date(expiresAt).toLocaleDateString() : '—';
    const planLabel =
      PLANS.find((p) => p.sku === activePlan)?.label ?? activePlan ?? 'Premium';
    return (
      <SafeAreaView
        edges={['top']}
        style={{ flex: 1, backgroundColor: theme.colors.background }}
      >
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[s.backBtn, { backgroundColor: theme.colors.surface }]}
          >
            <ChevronLeft size={20} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: theme.colors.text }]}>
            Premium
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
          }}
        >
          <Crown size={60} color="#FFB800" />
          <Text style={[s.activeTitle, { color: theme.colors.text }]}>
            You are Premium! 🎉
          </Text>
          <Text style={[s.activeSub, { color: theme.colors.muted }]}>
            Plan: {planLabel}
            {'\n'}Renews / Expires: {exp}
          </Text>
          <View
            style={[s.perksCard, { backgroundColor: theme.colors.surface }]}
          >
            {PERKS.map((p) => (
              <Text
                key={p.text}
                style={[s.perkRowText, { color: theme.colors.text }]}
              >
                {p.icon} {p.text}
              </Text>
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Purchase flow ─────────────────────────────────────────────────────────
  return (
    <SafeAreaView
      edges={['top']}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[s.backBtn, { backgroundColor: theme.colors.surface }]}
        >
          <ChevronLeft size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.colors.text }]}>
          Go Premium
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={[s.hero, { backgroundColor: theme.colors.surface }]}>
          <Crown size={48} color="#FFB800" />
          <Text style={[s.heroTitle, { color: theme.colors.text }]}>
            Ad-Free Experience
          </Text>
          <Text style={[s.heroSub, { color: theme.colors.muted }]}>
            Remove banner and interstitial ads permanently while subscribed.
            Rewarded ads remain available for bonus coins.
          </Text>
          {PERKS.map((p) => (
            <View key={p.text} style={s.perkLine}>
              <Text style={s.perkIcon}>{p.icon}</Text>
              <Text style={[s.perkText, { color: theme.colors.text }]}>
                {p.text}
              </Text>
            </View>
          ))}
        </View>

        <Text style={[s.sectionLabel, { color: theme.colors.muted }]}>
          Choose your plan
        </Text>

        {/* Plan cards */}
        {PLANS.map((plan) => {
          const selected = selectedSku === plan.sku;
          const busy = loadingSku === plan.sku;
          return (
            <TouchableOpacity
              key={plan.sku}
              onPress={() => setSelectedSku(plan.sku)}
              activeOpacity={0.8}
              style={[
                s.planCard,
                {
                  backgroundColor: selected
                    ? theme.colors.primary + '15'
                    : theme.colors.surface,
                  borderWidth: 2,
                  borderColor: selected
                    ? theme.colors.primary
                    : theme.colors.border,
                },
              ]}
            >
              {plan.badge && (
                <View
                  style={[
                    s.badge,
                    {
                      backgroundColor: plan.highlighted
                        ? '#FFB800'
                        : theme.colors.primary + '30',
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: plan.highlighted ? '#000' : theme.colors.primary,
                      fontWeight: '800',
                      fontSize: 10,
                    }}
                  >
                    {plan.badge}
                  </Text>
                </View>
              )}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <View>
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontWeight: '800',
                      fontSize: 16,
                    }}
                  >
                    {plan.label}
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.muted,
                      fontSize: 12,
                      marginTop: 2,
                    }}
                  >
                    {plan.perMonth}
                  </Text>
                </View>
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                >
                  {loadingPrices ? (
                    <ActivityIndicator
                      size="small"
                      color={theme.colors.muted}
                    />
                  ) : (
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontWeight: '900',
                        fontSize: 18,
                      }}
                    >
                      {busy ? '…' : getPrice(plan.sku)}
                    </Text>
                  )}
                  {selected && <Check size={18} color={theme.colors.primary} />}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Subscribe CTA */}
        <TouchableOpacity
          onPress={() => subscribe(selectedSku)}
          disabled={!!loadingSku}
          activeOpacity={0.85}
          style={[
            s.ctaBtn,
            {
              backgroundColor: loadingSku ? theme.colors.surface : '#FFB800',
              opacity: loadingSku ? 0.6 : 1,
            },
          ]}
        >
          {loadingSku ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            <>
              <Crown size={20} color="#000" />
              <Text style={s.ctaText}>
                Subscribe — {loadingPrices ? '…' : getPrice(selectedSku)}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Restore purchases — required by App Store review guidelines */}
        {Platform.OS === 'ios' && (
          <TouchableOpacity onPress={restore} style={{ padding: 16 }}>
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

        <Text style={[s.legal, { color: theme.colors.muted }]}>
          Subscriptions renew automatically unless cancelled at least 24 hours
          before the period ends. Manage in your{' '}
          {Platform.OS === 'ios' ? 'App Store' : 'Play Store'} account settings.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
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
  headerTitle: { fontSize: 20, fontWeight: '800' },
  scroll: { padding: 16, paddingBottom: 60 },

  hero: {
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    gap: 6,
  },
  heroTitle: { fontSize: 22, fontWeight: '900', marginTop: 8 },
  heroSub: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  perkLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 2,
  },
  perkIcon: { fontSize: 16 },
  perkText: { fontSize: 14 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  planCard: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 10,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -10,
    right: 14,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },

  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    borderRadius: 20,
    marginTop: 8,
    marginBottom: 4,
  },
  ctaText: { fontWeight: '900', fontSize: 17, color: '#000' },
  legal: {
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 8,
    paddingHorizontal: 8,
  },

  activeTitle: {
    fontSize: 26,
    fontWeight: '900',
    marginTop: 16,
    marginBottom: 8,
  },
  activeSub: { textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  perksCard: { borderRadius: 18, padding: 18, width: '100%', gap: 10 },
  perkRowText: { fontSize: 15 },
});
