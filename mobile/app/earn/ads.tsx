import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/src/theme/useTheme';
import { showRewardedAd } from '@/src/ads/admob';
import { useCoinStore } from '@/src/store/useCoinStore';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { api } from '@/src/api/api';
import { useAppStateStore } from '@/src/store/useAppStateStore';

export default function EarnAdsScreen() {
  const [loadingAd, setLoadingAd] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState<number | null>(null);

  const theme = useTheme();
  const router = useRouter();

  const watchAd = async () => {
    if (loadingAd || cooldown) return;

    try {
      setLoadingAd(true);

      const success = await showRewardedAd();

      if (success) {
        const res = await api.post('/ads/reward');

        useCoinStore.getState().setCoins(res.data.coins);
        useAppStateStore.getState().markRewardedAdWatched();

        showToast('+50 coins added 🎉');
        setCooldown(res.data.cooldownSeconds);
      }
    } catch (e: any) {
      if (e.response?.status === 429) {
        setCooldown(e.response.data.remainingSeconds);
      } else {
        showToast('Ad failed, try again');
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

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <TouchableOpacity
        onPress={() => router.replace('/')}
        style={[styles.backBtn, { backgroundColor: theme.colors.surface }]}
      >
        <ChevronLeft size={18} color={theme.colors.text} />
        <Text style={{ color: theme.colors.text, fontWeight: '600' }}>
          Home
        </Text>
      </TouchableOpacity>
      <View style={{ padding: 20, marginTop: 50 }}>
        <Text
          style={{ color: theme.colors.text, fontWeight: '800', fontSize: 20 }}
        >
          Earn Coins
        </Text>

        <Text style={{ color: theme.colors.muted, marginTop: 8 }}>
          Watch a short video to earn coins
        </Text>

        <TouchableOpacity
          disabled={loadingAd || cooldown !== null}
          onPress={watchAd}
          style={{
            marginTop: 20,
            padding: 16,
            borderRadius: 16,
            backgroundColor:
              loadingAd || cooldown ? theme.colors.muted : theme.colors.primary,
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Text
            style={{
              color: '#fff',
              fontWeight: '900',
              opacity: loadingAd || cooldown ? 0.7 : 1,
            }}
          >
            {cooldown ? `Next ad in ${cooldown}s` : '▶ Watch Ad (+50 coins)'}
          </Text>

          {loadingAd && <ActivityIndicator size="small" color="#fff" />}
        </TouchableOpacity>
      </View>

      {toast && (
        <View
          style={{
            position: 'absolute',
            bottom: 40,
            alignSelf: 'center',
            backgroundColor: theme.colors.surface,
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 20,
            shadowOpacity: 0.25,
            elevation: 6,
          }}
        >
          <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>
            {toast}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backBtn: {
    position: 'absolute',
    top: 44,
    left: 16,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
});
