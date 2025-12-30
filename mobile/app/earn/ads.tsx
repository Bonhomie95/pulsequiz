import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/src/theme/useTheme';
import { showRewardedAd } from '@/src/ads/admob';
import { useCoinStore } from '@/src/store/useCoinStore';
import { useRouter } from 'expo-router';

export default function EarnAdsScreen() {
  const theme = useTheme();
  const router = useRouter();

  const watchAd = async () => {
    const success = await showRewardedAd();
    if (success) {
      useCoinStore.getState().addCoins(50); // 🎁 reward
      router.back();
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ padding: 20 }}>
        <Text
          style={{ color: theme.colors.text, fontWeight: '800', fontSize: 20 }}
        >
          Earn Coins
        </Text>

        <Text style={{ color: theme.colors.muted, marginTop: 8 }}>
          Watch a short video to earn coins
        </Text>

        <TouchableOpacity
          onPress={watchAd}
          style={{
            marginTop: 20,
            padding: 16,
            borderRadius: 16,
            backgroundColor: theme.colors.primary,
          }}
        >
          <Text
            style={{ color: '#fff', fontWeight: '900', textAlign: 'center' }}
          >
            ▶ Watch Ad (+50 coins)
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
