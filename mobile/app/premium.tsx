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
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as IAP from 'react-native-iap';
import { ErrorCode } from 'react-native-iap';
import type { Purchase, PurchaseError } from 'react-native-iap';
import { ChevronLeft, Crown, Check } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { useTheme } from '@/src/theme/useTheme';
import { errorMessage } from '@/src/api/api';
import { usePremiumStore } from '@/src/store/usePremiumStore';
import { logger } from '@/src/utils/logger';
import { LINKS } from '@/src/constants/links';
import { verifyAndFinish, SUBSCRIPTION_SKUS } from '@/src/iap/verify';

// ─── Plan definitions ─────────────────────────────────────────────────────────

type PlanMeta = {
  sku: (typeof SUBSCRIPTION_SKUS)[number];
  label: string;
  /** Billing period shown next to the price ("/ year"). */
  period: string;
  months: number;
  highlighted?: boolean;
};

// Prices come ONLY from the store (localised, exact). Hardcoded USD figures
// were wrong for most of the world and the store price must be the most
// prominent one on a subscription screen (Guideline 3.1.2).
const PLANS: PlanMeta[] = [
  { sku: 'pq_premium_monthly', label: 'Monthly', period: 'month', months: 1 },
  { sku: 'pq_premium_3month', label: '3 Months', period: '3 months', months: 3 },
  { sku: 'pq_premium_6month', label: '6 Months', period: '6 months', months: 6, highlighted: true },
  { sku: 'pq_premium_yearly', label: '12 Months', period: 'year', months: 12 },
];

const ALL_SKUS: string[] = [...SUBSCRIPTION_SKUS];

type StorePrice = { display: string; amount: number | null; currency: string | null };

function perMonthLabel(p: StorePrice | undefined, months: number): string | null {
  if (!p || p.amount == null || !p.currency || months <= 1) return null;
  try {
    const fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: p.currency });
    return `${fmt.format(p.amount / months)} / month`;
  } catch {
    return null;
  }
}

function savingsBadge(prices: Record<string, StorePrice>, plan: PlanMeta): string | null {
  const monthly = prices.pq_premium_monthly?.amount;
  const mine = prices[plan.sku]?.amount;
  if (!monthly || !mine || plan.months <= 1) return null;
  const pct = Math.round((1 - mine / (monthly * plan.months)) * 100);
  return pct >= 5 ? `Save ${pct}%` : null;
}

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
  } = usePremiumStore();

  const [storePrices, setStorePrices] = useState<Record<string, StorePrice>>({});
  const [restoring, setRestoring] = useState(false);
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
        const prices: Record<string, StorePrice> = {};
        for (const s of subs ?? []) {
          prices[s.id] = {
            display: s.displayPrice,
            amount: typeof s.price === 'number' ? s.price : null,
            currency: s.currency ?? null,
          };
        }
        setStorePrices(prices);
      } catch (e) {
        logger.warn('Premium IAP init failed', { error: String(e) });
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
        // Ignore coin packs — the Buy screen owns those.
        if (!ALL_SKUS.includes(purchase.productId)) return;
        const sku = purchase.productId;
        pendingSkuRef.current = null;

        try {
          await verifyAndFinish(purchase);
          Alert.alert('🎉 Premium Activated!', 'Enjoy your ad-free experience!');
          router.back();
        } catch (e: any) {
          const status = e?.response?.status;
          logger.error('Subscription verification failed', e, { sku, status });

          // Only a 4xx means the receipt was actually rejected. Everything
          // else — offline, 5xx — is retried automatically next launch
          // (reconcilePendingPurchases), because the transaction has
          // deliberately not been finished.
          const terminal = typeof status === 'number' && status >= 400 && status < 500;

          Alert.alert(
            terminal ? 'Verification failed' : 'Almost there',
            terminal
              ? errorMessage(
                  e,
                  "Your subscription couldn't be verified. If you were charged, contact support and we'll sort it out.",
                )
              : "We couldn't reach PulseQuiz to confirm your subscription. It is safe — premium will activate automatically next time you open the app.",
          );
        } finally {
          setLoadingSku(null);
        }
      },
    );

    const errorSub = IAP.purchaseErrorListener((error: PurchaseError) => {
      if (error.code !== ErrorCode.UserCancelled) {
        logger.warn('Store subscription error', { code: error.code });
        Alert.alert(
          'Purchase failed',
          error.message ?? "The store couldn't complete that purchase.",
        );
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

  // ── Restore purchases (required by App Store review) ──────────────────────
  const restore = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      // Ask the store what this Apple ID / Google account owns, and verify the
      // newest subscription with our server (which also rejects a receipt
      // already attached to a different PulseQuiz account).
      await IAP.initConnection();
      const purchases = await IAP.getAvailablePurchases();
      const sub = purchases
        .filter((p) => ALL_SKUS.includes(p.productId))
        .sort((a, b) => (b.transactionDate ?? 0) - (a.transactionDate ?? 0))[0];

      if (sub) {
        await verifyAndFinish(sub);
        Alert.alert('Restored!', 'Your subscription has been restored.');
        router.back();
        return;
      }

      // Nothing on the store side — check our own records (e.g. a purchase
      // made on another device with this account).
      await usePremiumStore.getState().checkStatus();
      if (usePremiumStore.getState().isPremium) {
        Alert.alert('Restored!', 'Your subscription is active on this account.');
        router.back();
      } else {
        Alert.alert('No subscription found', 'There is no active PulseQuiz subscription on this store account.');
      }
    } catch (e: any) {
      Alert.alert('Restore failed', errorMessage(e, 'Please check your connection and try again.'));
    } finally {
      setRestoring(false);
    }
  };

  const priceOf = (sku: string) => storePrices[sku]?.display ?? null;
  const planOf = (sku: string) => PLANS.find((p) => p.sku === sku)!;
  const selectedPrice = priceOf(selectedSku);

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
          
            accessibilityRole="button"
            hitSlop={8}
            accessibilityLabel="Go back">
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
          <TouchableOpacity
            onPress={() => IAP.deepLinkToSubscriptions({ skuAndroid: activePlan ?? undefined }).catch(() => {})}
            style={{ paddingVertical: 12, marginBottom: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Manage subscription"
          >
            <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>
              Manage or cancel subscription
            </Text>
          </TouchableOpacity>
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
        
            accessibilityRole="button"
            hitSlop={8}
            accessibilityLabel="Go back">
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
          const badge = savingsBadge(storePrices, plan);
          const perMonth = perMonthLabel(storePrices[plan.sku], plan.months);
          const price = priceOf(plan.sku);
          return (
            <TouchableOpacity
              key={plan.sku}
              accessibilityRole="radio"
              accessibilityLabel={`${plan.label} plan${price ? `, ${price} per ${plan.period}` : ''}`}
              accessibilityState={{ selected }}
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
            hitSlop={8}>
              {badge && (
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
                    {badge}
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
                  {perMonth && (
                    <Text
                      style={{
                        color: theme.colors.muted,
                        fontSize: 12,
                        marginTop: 2,
                      }}
                    >
                      {perMonth}
                    </Text>
                  )}
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
                      {busy ? '…' : price ? `${price} / ${plan.period}` : '—'}
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
          // No store price = the store is unreachable; never sell at a guessed price.
          disabled={!!loadingSku || !selectedPrice}
          activeOpacity={0.85}
          style={[
            s.ctaBtn,
            {
              backgroundColor: loadingSku || !selectedPrice ? theme.colors.surface : '#FFB800',
              opacity: loadingSku || !selectedPrice ? 0.6 : 1,
            },
          ]}
        
            accessibilityRole="button"
            hitSlop={8}
            accessibilityLabel={selectedPrice ? `Subscribe for ${selectedPrice} per ${planOf(selectedSku).period}` : 'Subscribe'}>
          {loadingSku ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            <>
              <Crown size={20} color="#000" />
              <Text style={s.ctaText}>
                {loadingPrices
                  ? 'Loading prices…'
                  : selectedPrice
                    ? `Subscribe — ${selectedPrice} / ${planOf(selectedSku).period}`
                    : 'Store unavailable — try again later'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Restore purchases — required by App Store review guidelines */}
        <TouchableOpacity onPress={restore} disabled={restoring} style={{ padding: 16 }}
          accessibilityRole="button"
          accessibilityLabel="Restore Purchases"
          accessibilityState={{ disabled: restoring, busy: restoring }}
          hitSlop={8}>
          {restoring ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            <Text
              style={{
                color: theme.colors.primary,
                textAlign: 'center',
                fontWeight: '600',
              }}
            >
              Restore Purchases
            </Text>
          )}
        </TouchableOpacity>

        {/* Apple requires the subscription's length and price, the auto-renew
            terms, and functional Terms of Use (EULA) and Privacy Policy links
            to appear in the binary on the purchase screen itself — links on a
            sign-in page or in App Store Connect alone do not satisfy it, and
            their absence is a routine rejection. */}
        <Text style={[s.legal, { color: theme.colors.muted }]}>
          Payment is charged to your{' '}
          {Platform.OS === 'ios' ? 'Apple ID' : 'Google Play'} account at
          confirmation of purchase. Subscriptions renew automatically for the
          same period and price unless cancelled at least 24 hours before the
          current period ends. Manage or cancel in your{' '}
          {Platform.OS === 'ios' ? 'App Store' : 'Play Store'} account settings.
        </Text>

        <View style={s.legalLinks}>
          <Text
            style={[s.legalLink, { color: theme.colors.primary }]}
            onPress={() => Linking.openURL(LINKS.TERMS).catch(() => {})}
            accessibilityRole="link"
            accessibilityLabel="Terms of Use"
          >
            Terms of Use
          </Text>
          <Text style={[s.legal, { color: theme.colors.muted }]}>  ·  </Text>
          <Text
            style={[s.legalLink, { color: theme.colors.primary }]}
            onPress={() => Linking.openURL(LINKS.PRIVACY).catch(() => {})}
            accessibilityRole="link"
            accessibilityLabel="Privacy Policy"
          >
            Privacy Policy
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 8,
    marginBottom: 24,
  },
  legalLink: { fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
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
