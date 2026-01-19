import { View } from 'react-native';
import {
  BannerAd,
  BannerAdSize,
  TestIds,
} from 'react-native-google-mobile-ads';

const bannerUnitId = __DEV__
  ? TestIds.BANNER
  : process.env.EXPO_PUBLIC_ADMOB_BANNER_ID!;

export function AdBanner() {
  return (
    <View style={{ alignItems: 'center', marginVertical: 8 }}>
      <BannerAd unitId={bannerUnitId} size={BannerAdSize.BANNER} />
    </View>
  );
}
