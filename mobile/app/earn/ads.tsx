import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/src/theme/useTheme';
import { showRewardedAd } from '@/src/ads/admob';
import { useCoinStore } from '@/src/store/useCoinStore';
import { useRouter } from 'expo-router';
import { ChevronLeft, PlayCircle, Clock } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { api } from '@/src/api/api';
import { useAppStateStore } from '@/src/store/useAppStateStore';
import { CoinRewardToast } from '@/src/components/CoinRewardToast';

export default function EarnAdsScreen() {
  const [loadingAd, setLoadingAd] = useState(false);
  const [cooldown, setCooldown] = useState<number | null>(null);
  const [rewardToast, setRewardToast] = useState({ visible: false, coins: 0 });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const theme = useTheme();
  const router = useRouter();

  const watchAd = async () => {
    if (loadingAd || cooldown) return;
    setErrorMsg(null);
    try {
      setLoadingAd(true);
      const success = await showRewardedAd();
      if (success) {
        const res = await api.post('/ads/reward');
        const earned = res.data.coinsEarned ?? 50;
        useCoinStore.getState().setCoins(res.data.coins);
        useAppStateStore.getState().markRewardedAdWatched();
        setRewardToast({ visible: true, coins: earned });
        if (res.data.cooldownSeconds) setCooldown(res.data.cooldownSeconds);
      } else {
        setErrorMsg('Ad not available right now. Try again in a moment.');
      }
    } catch (e: any) {
      if (e.response?.status === 429) {
        setCooldown(e.response.data.remainingSeconds);
        setErrorMsg('Daily limit reached. Come back tomorrow!');
      } else {
        setErrorMsg('Something went wrong. Please try again.');
      }
    } finally {
      setLoadingAd(false);
    }
  };

  useEffect(() => {
    if (!cooldown) return;
    const t = setInterval(() => {
      setCooldown((c) => {
        if (!c || c <= 1) return null;
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const formatCooldown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const isDisabled = loadingAd || cooldown !== null;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Coin reward toast */}
      <CoinRewardToast
        visible={rewardToast.visible}
        coins={rewardToast.coins}
        label="Ad Reward!"
        onHide={() => setRewardToast({ visible: false, coins: 0 })}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: theme.colors.surface }]}
        >
          <ChevronLeft size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.text }]}>Watch Ads</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={{ padding: 20, flex: 1 }}>
        {/* Info card */}
        <View style={[styles.infoCard, { backgroundColor: theme.colors.surface }]}>
          <Text style={{ fontSize: 44, marginBottom: 12 }}>📺</Text>
          <Text style={[styles.heading, { color: theme.colors.text }]}>Earn Free Coins</Text>
          <Text style={[styles.sub, { color: theme.colors.muted }]}>
            Watch a short video ad to earn coins instantly. Up to 5 ads per day.
          </Text>
          <View style={[styles.rewardBadge, { backgroundColor: theme.colors.coin + '22', borderColor: theme.colors.coin + '55' }]}>
            <Text style={{ fontSize: 22 }}>🪙</Text>
            <Text style={[styles.rewardText, { color: theme.colors.coin }]}>+50 coins per ad</Text>
          </View>
        </View>

        {/* Error message */}
        {errorMsg && (
          <View style={[styles.errorCard, { backgroundColor: theme.colors.danger + '18', borderColor: theme.colors.danger + '44' }]}>
            <Text style={{ color: theme.colors.danger, fontWeight: '600', fontSize: 14 }}>{errorMsg}</Text>
          </View>
        )}

        {/* Cooldown indicator */}
        {cooldown !== null && (
          <View style={[styles.cooldownRow, { backgroundColor: theme.colors.surface }]}>
            <Clock size={16} color={theme.colors.muted} />
            <Text style={{ color: theme.colors.muted, fontSize: 14, fontWeight: '600' }}>
              Next ad in {formatCooldown(cooldown)}
            </Text>
          </View>
        )}

        {/* Watch button */}
        <TouchableOpacity
          disabled={isDisabled}
          onPress={watchAd}
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
            {loadingAd ? 'Loading ad…' : cooldown ? `Next ad in ${formatCooldown(cooldown)}` : '▶ Watch Ad  (+50 coins)'}
          </Text>
        </TouchableOpacity>

        <Text style={[styles.note, { color: theme.colors.muted }]}>
          💡 Coins power hints, wagers, and tournament entries.
        </Text>
      </View>
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
  infoCard: { borderRadius: 24, padding: 24, alignItems: 'center', marginBottom: 20 },
  heading: { fontSize: 22, fontWeight: '900', marginBottom: 8 },
  sub: { textAlign: 'center', fontSize: 14, lineHeight: 21, marginBottom: 16 },
  rewardBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14, borderWidth: 1.5,
  },
  rewardText: { fontSize: 16, fontWeight: '800' },
  errorCard: { borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1.5 },
  cooldownRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 14, padding: 12, marginBottom: 14,
  },
  watchBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 18, borderRadius: 20, marginBottom: 14,
  },
  watchBtnText: { fontSize: 16, fontWeight: '900' },
  note: { textAlign: 'center', fontSize: 12, lineHeight: 18 },
});
