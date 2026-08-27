import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/src/theme/useTheme';
import { showRewardedAd } from '@/src/ads/admob';
import { useCoinStore } from '@/src/store/useCoinStore';
import { useRouter } from 'expo-router';
import { ChevronLeft, PlayCircle, Clock, Check } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '@/src/api/api';
import { useAppStateStore } from '@/src/store/useAppStateStore';
import { CoinRewardToast } from '@/src/components/CoinRewardToast';

type AdConfig = {
  coinsPerAd: number;
  dailyMax: number;
  watchedToday: number;
  remainingToday: number;
  cooldownSeconds: number;
  cooldownRemaining: number;
  /** When true the server credits from Google's callback, not from our POST. */
  serverVerified: boolean;
};

/**
 * How long to wait for the AdMob server-side verification callback to land
 * before telling the user to check back. It is usually near-instant.
 */
const SSV_POLL_ATTEMPTS = 6;
const SSV_POLL_INTERVAL_MS = 1500;

export default function EarnAdsScreen() {
  const [config, setConfig] = useState<AdConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [loadingAd, setLoadingAd] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [rewardToast, setRewardToast] = useState({ visible: false, coins: 0 });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const theme = useTheme();
  const router = useRouter();
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  // ── Config ────────────────────────────────────────────────────────────────
  // The reward and daily cap come from the server. Hardcoding "+50 coins" in
  // the UI while the server paid a different amount was a reliable way to make
  // users feel cheated.
  const loadConfig = useCallback(async () => {
    try {
      setConfigError(null);
      const res = await api.get<AdConfig>('/ads/config');
      if (!mounted.current) return;
      setConfig(res.data);
      setCooldown(res.data.cooldownRemaining ?? 0);
    } catch (e) {
      if (!mounted.current) return;
      setConfigError(errorMessage(e, "Couldn't load ad rewards."));
    } finally {
      if (mounted.current) {
        setLoadingConfig(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // ── Cooldown ticker ───────────────────────────────────────────────────────
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
    // Re-arm only when the ticker transitions between idle and running.
  }, [cooldown > 0]);

  /**
   * With SSV on, our POST doesn't credit anything — Google's callback does.
   * Poll the balance briefly so the coins appear without the user having to
   * back out and return.
   */
  const awaitServerCredit = async (startingCoins: number): Promise<number | null> => {
    for (let i = 0; i < SSV_POLL_ATTEMPTS; i++) {
      await new Promise((r) => setTimeout(r, SSV_POLL_INTERVAL_MS));
      if (!mounted.current) return null;
      try {
        const res = await api.get('/coins/wallet');
        const coins = res.data?.coins ?? 0;
        if (coins > startingCoins) return coins;
      } catch {
        /* keep polling */
      }
    }
    return null;
  };

  const watchAd = async () => {
    if (loadingAd || cooldown > 0 || !config || config.remainingToday <= 0) return;

    setErrorMsg(null);
    setLoadingAd(true);

    const startingCoins = useCoinStore.getState().coins;

    try {
      const watched = await showRewardedAd();
      if (!watched) {
        setErrorMsg('No ad was available just now. Try again in a moment.');
        return;
      }

      const res = await api.post('/ads/reward');
      useAppStateStore.getState().markRewardedAdWatched();

      if (res.data?.pending) {
        // Server-verified flow: wait for Google's callback to land.
        const credited = await awaitServerCredit(startingCoins);
        if (!mounted.current) return;

        if (credited != null) {
          useCoinStore.getState().setCoins(credited);
          setRewardToast({ visible: true, coins: credited - startingCoins });
        } else {
          setErrorMsg(
            'Your reward is being confirmed by the ad network. It will appear in your balance shortly.',
          );
        }
      } else {
        useCoinStore.getState().setCoins(res.data.coins);
        setRewardToast({ visible: true, coins: res.data.added ?? config.coinsPerAd });
      }

      await loadConfig();
      setCooldown(config.cooldownSeconds);
    } catch (e: any) {
      if (!mounted.current) return;
      if (e?.response?.status === 429) {
        setErrorMsg(errorMessage(e, "You've reached today's ad limit."));
        await loadConfig();
      } else {
        setErrorMsg(errorMessage(e));
      }
    } finally {
      if (mounted.current) setLoadingAd(false);
    }
  };

  const formatCooldown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const capReached = !!config && config.remainingToday <= 0;
  const isDisabled = loadingAd || cooldown > 0 || capReached || !config;

  const buttonLabel = () => {
    if (loadingAd) return 'Loading ad…';
    if (capReached) return "That's all for today";
    if (cooldown > 0) return `Next ad in ${formatCooldown(cooldown)}`;
    return `Watch ad  ·  +${config?.coinsPerAd ?? 0} coins`;
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <CoinRewardToast
        visible={rewardToast.visible}
        coins={rewardToast.coins}
        label="Ad reward"
        onHide={() => setRewardToast({ visible: false, coins: 0 })}
      />

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: theme.colors.surface }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
        >
          <ChevronLeft size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.text }]}>Watch ads</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadConfig(); }}
            tintColor={theme.colors.primary}
          />
        }
      >
        {loadingConfig ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : configError ? (
          <View style={[styles.errorCard, { backgroundColor: theme.colors.danger + '18', borderColor: theme.colors.danger + '44' }]}>
            <Text style={{ color: theme.colors.danger, fontWeight: '600', fontSize: 14 }}>
              {configError}
            </Text>
            <TouchableOpacity
              onPress={loadConfig}
              style={{ marginTop: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Retry loading ad rewards"
              hitSlop={8}
            >
              <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={[styles.infoCard, { backgroundColor: theme.colors.surface }]}>
              <Text style={{ fontSize: 44, marginBottom: 12 }}>📺</Text>
              <Text style={[styles.heading, { color: theme.colors.text }]}>Earn free coins</Text>
              <Text style={[styles.sub, { color: theme.colors.muted }]}>
                Watch a short video to earn coins. You can watch up to{' '}
                {config?.dailyMax} {config?.dailyMax === 1 ? 'ad' : 'ads'} a day.
              </Text>
              <View
                style={[
                  styles.rewardBadge,
                  { backgroundColor: theme.colors.coin + '22', borderColor: theme.colors.coin + '55' },
                ]}
                accessible
                accessibilityLabel={`${config?.coinsPerAd} coins per ad`}
              >
                <Text style={{ fontSize: 22 }}>🪙</Text>
                <Text style={[styles.rewardText, { color: theme.colors.coin }]}>
                  +{config?.coinsPerAd} coins per ad
                </Text>
              </View>
            </View>

            {/* Progress — concrete beats "up to 5 a day" */}
            <View
              style={[styles.progressRow, { backgroundColor: theme.colors.surface }]}
              accessible
              accessibilityLabel={`${config?.watchedToday} of ${config?.dailyMax} ads watched today`}
            >
              {Array.from({ length: config?.dailyMax ?? 0 }).map((_, i) => {
                const done = i < (config?.watchedToday ?? 0);
                return (
                  <View
                    key={i}
                    style={[
                      styles.pip,
                      {
                        backgroundColor: done ? theme.colors.success : theme.colors.border,
                      },
                    ]}
                  >
                    {done && <Check size={12} color="#fff" strokeWidth={3} />}
                  </View>
                );
              })}
              <Text style={{ color: theme.colors.muted, fontSize: 13, fontWeight: '700', marginLeft: 6 }}>
                {config?.watchedToday}/{config?.dailyMax} today
              </Text>
            </View>

            {errorMsg && (
              <View style={[styles.errorCard, { backgroundColor: theme.colors.danger + '18', borderColor: theme.colors.danger + '44' }]}>
                <Text style={{ color: theme.colors.danger, fontWeight: '600', fontSize: 14 }}>
                  {errorMsg}
                </Text>
              </View>
            )}

            {cooldown > 0 && !capReached && (
              <View style={[styles.cooldownRow, { backgroundColor: theme.colors.surface }]}>
                <Clock size={16} color={theme.colors.muted} />
                <Text style={{ color: theme.colors.muted, fontSize: 14, fontWeight: '600' }}>
                  Next ad in {formatCooldown(cooldown)}
                </Text>
              </View>
            )}

            <TouchableOpacity
              disabled={isDisabled}
              onPress={watchAd}
              accessibilityRole="button"
              accessibilityLabel={buttonLabel()}
              accessibilityState={{ disabled: isDisabled, busy: loadingAd }}
              style={[
                styles.watchBtn,
                {
                  backgroundColor: isDisabled ? theme.colors.surface : theme.colors.primary,
                  borderWidth: isDisabled ? 1.5 : 0,
                  borderColor: theme.colors.border,
                  opacity: isDisabled && !loadingAd ? 0.7 : 1,
                },
              ]}
            >
              {loadingAd ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <PlayCircle size={22} color={isDisabled ? theme.colors.muted : '#fff'} />
              )}
              <Text style={[styles.watchBtnText, { color: isDisabled ? theme.colors.muted : '#fff' }]}>
                {buttonLabel()}
              </Text>
            </TouchableOpacity>

            <Text style={[styles.note, { color: theme.colors.muted }]}>
              {capReached
                ? 'Your daily ads reset at midnight UTC.'
                : '💡 Coins power hints, extra time, wagers and tournament entries.'}
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  infoCard: { borderRadius: 24, padding: 24, alignItems: 'center', marginBottom: 16 },
  heading: { fontSize: 22, fontWeight: '900', marginBottom: 8 },
  sub: { textAlign: 'center', fontSize: 14, lineHeight: 21, marginBottom: 16 },
  rewardBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14, borderWidth: 1.5,
  },
  rewardText: { fontSize: 16, fontWeight: '800' },
  progressRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 14, padding: 14, marginBottom: 14,
  },
  pip: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  errorCard: { borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1.5 },
  cooldownRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 14, padding: 12, marginBottom: 14,
  },
  watchBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 18, borderRadius: 20, marginBottom: 14,
    minHeight: 56,
  },
  watchBtnText: { fontSize: 16, fontWeight: '900' },
  note: { textAlign: 'center', fontSize: 12, lineHeight: 18 },
});
