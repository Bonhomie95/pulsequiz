import { View, StyleSheet } from 'react-native';

export function Skeleton({ height = 16, width = '100%' }: any) {
  return <View style={[styles.skel, { height, width }]} />;
}

export function HomeSkeleton() {
  return (
    <View>
      <Skeleton height={48} width={180} />
      <View style={{ height: 16 }} />
      <Skeleton height={80} />
      <View style={{ height: 24 }} />
      <Skeleton height={60} />
      <Skeleton height={60} />
    </View>
  );
}

const styles = StyleSheet.create({
  skel: {
    backgroundColor: '#E5E7EB',
    borderRadius: 10,
    opacity: 0.7,
  },
});
