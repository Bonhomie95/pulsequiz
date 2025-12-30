import { View } from 'react-native';
import {
  BannerAd,
  BannerAdSize,
  TestIds,
} from 'react-native-google-mobile-ads';

export function AdBanner() {
  return (
    <View style={{ alignItems: 'center', marginVertical: 8 }}>
      <BannerAd
        unitId={__DEV__ ? TestIds.BANNER : 'ca-app-pub-XXXX/XXXX'}
        size={BannerAdSize.BANNER}
      />
    </View>
  );
}
