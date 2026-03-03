import { View } from 'react-native';
import {
  BannerAd,
  BannerAdSize,
  TestIds,
} from 'react-native-google-mobile-ads';
import { usePremiumStore } from '@/src/store/usePremiumStore';

const bannerUnitId = __DEV__
  ? TestIds.BANNER
  : process.env.EXPO_PUBLIC_ADMOB_BANNER_ID!;

export function AdBanner() {
  const isPremium = usePremiumStore((s) => s.isPremium);

  // Premium subscribers never see banner ads
  if (isPremium) return null;

  return (
    <View style={{ alignItems: 'center', marginVertical: 8 }}>
      <BannerAd unitId={bannerUnitId} size={BannerAdSize.BANNER} />
    </View>
  );
}
