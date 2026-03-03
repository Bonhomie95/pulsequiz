import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/src/theme/useTheme';

type Props = {
  visible: boolean;
  coins: number;
  label?: string;
  onHide: () => void;
};

export function CoinRewardToast({ visible, coins, label = 'Reward Earned!', onHide }: Props) {
  const theme = useTheme();
  const translateY = useRef(new Animated.Value(120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.85)).current;
  const coinScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    // Slide in
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, friction: 7, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: true }),
    ]).start();

    // Coin bounce in after 100ms
    setTimeout(() => {
      Animated.spring(coinScale, { toValue: 1, friction: 4, tension: 200, useNativeDriver: true }).start();
    }, 120);

    // Auto hide after 3s
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 120, duration: 300, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => {
        onHide();
        coinScale.setValue(0);
        scale.setValue(0.85);
      });
    }, 3000);

    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.wrap,
        { opacity, transform: [{ translateY }, { scale }] }
      ]}
    >
      <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        {/* Left: glowing coin */}
        <Animated.View style={[styles.coinCircle, { transform: [{ scale: coinScale }] }]}>
          <View style={[styles.coinGlow, { backgroundColor: theme.colors.coin + '33' }]} />
          <Text style={styles.coinEmoji}>🪙</Text>
        </Animated.View>

        {/* Middle: text */}
        <View style={styles.textBlock}>
          <Text style={[styles.label, { color: theme.colors.muted }]}>{label}</Text>
          <Text style={[styles.amount, { color: theme.colors.coin }]}>+{coins} Coins</Text>
        </View>

        {/* Right: checkmark badge */}
        <View style={[styles.checkBadge, { backgroundColor: theme.colors.success + '22' }]}>
          <Text style={{ fontSize: 16 }}>✓</Text>
        </View>
      </View>

      {/* Glow bar at bottom */}
      <View style={[styles.glowBar, { backgroundColor: theme.colors.coin }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 48,
    left: 20,
    right: 20,
    zIndex: 9999,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 22,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  coinCircle: {
    width: 52,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coinGlow: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  coinEmoji: { fontSize: 30 },
  textBlock: { flex: 1 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 3 },
  amount: { fontSize: 22, fontWeight: '900' },
  checkBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glowBar: {
    height: 3,
    borderRadius: 2,
    marginTop: 6,
    opacity: 0.6,
  },
});
