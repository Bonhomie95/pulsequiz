/**
 * src/components/CheckInModal.tsx
 *
 * Full-screen animated modal for daily check-in reward.
 * Shows streak count, coins earned, milestone bonus if any.
 * Replaces the old subtle toast — this is unmissable.
 */
import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '@/src/theme/useTheme';

type Props = {
  visible: boolean;
  streak: number;
  coinsAdded: number;
  milestoneBonus: number;
  onClose: () => void;
};

// Milestone messages
function getMilestoneLabel(streak: number) {
  if (streak === 7)  return '🎉 One Week Streak!';
  if (streak === 10) return '🔟 10-Day Streak!';
  if (streak === 20) return '💥 20-Day Streak!';
  if (streak === 30) return '👑 30-Day Legend!';
  if (streak === 50) return '🌟 50-Day Master!';
  if (streak === 100)return '🏆 100-Day Champion!';
  return null;
}

function getStreakEmoji(streak: number) {
  if (streak >= 30) return '👑';
  if (streak >= 20) return '🔥';
  if (streak >= 10) return '⚡';
  if (streak >= 7)  return '💎';
  return '🔥';
}

export function CheckInModal({ visible, streak, coinsAdded, milestoneBonus, onClose }: Props) {
  const theme = useTheme();

  // Animations
  const backdrop  = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.6)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const coinBounce = useRef(new Animated.Value(0)).current;
  const streakPop  = useRef(new Animated.Value(0)).current;
  const shimmer    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    // Reset
    backdrop.setValue(0);
    cardScale.setValue(0.6);
    cardOpacity.setValue(0);
    coinBounce.setValue(0);
    streakPop.setValue(0);
    shimmer.setValue(0);

    // Entry sequence
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.spring(cardScale, { toValue: 1, friction: 6, tension: 180, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      // Coin bounce after card arrives
      Animated.sequence([
        Animated.spring(coinBounce, { toValue: 1, friction: 3, tension: 300, useNativeDriver: true }),
        Animated.spring(coinBounce, { toValue: 0.9, friction: 4, useNativeDriver: true }),
        Animated.spring(coinBounce, { toValue: 1, friction: 6, useNativeDriver: true }),
      ]).start();

      // Streak pop
      setTimeout(() => {
        Animated.spring(streakPop, { toValue: 1, friction: 5, tension: 200, useNativeDriver: true }).start();
      }, 150);

      // Shimmer loop
      Animated.loop(
        Animated.sequence([
          Animated.timing(shimmer, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(shimmer, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      ).start();
    });
  }, [visible]);

  if (!visible) return null;

  const milestoneLabel = getMilestoneLabel(streak);
  const baseCoins = coinsAdded - milestoneBonus;

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onClose}>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} 
            accessibilityRole="button"
            accessibilityLabel="Dismiss check-in"
            hitSlop={8}
          />
      </Animated.View>

      {/* Card */}
      <View style={styles.centerer} pointerEvents="box-none">
        <Animated.View style={[
          styles.card,
          { backgroundColor: theme.colors.surface, transform: [{ scale: cardScale }], opacity: cardOpacity },
        ]}>

          {/* Top glow accent */}
          <View style={[styles.topAccent, { backgroundColor: theme.colors.primary }]} />

          {/* Streak badge */}
          <Animated.View style={[
            styles.streakBadge,
            { backgroundColor: theme.colors.primary + '18', transform: [{ scale: streakPop }] },
          ]}>
            <Text style={styles.streakEmoji}>{getStreakEmoji(streak)}</Text>
            <Text style={[styles.streakDayLabel, { color: theme.colors.muted }]}>Day</Text>
            <Text style={[styles.streakNumber, { color: theme.colors.primary }]}>{streak}</Text>
            <Text style={[styles.streakText, { color: theme.colors.muted }]}>streak</Text>
          </Animated.View>

          {/* Milestone banner */}
          {milestoneLabel && (
            <View style={[styles.milestoneBanner, { backgroundColor: '#FFB800' + '22', borderColor: '#FFB800' + '44' }]}>
              <Text style={[styles.milestoneText, { color: '#FFB800' }]}>{milestoneLabel}</Text>
            </View>
          )}

          {/* Main heading */}
          <Text style={[styles.title, { color: theme.colors.text }]}>Daily Check-In!</Text>
          <Text style={[styles.sub, { color: theme.colors.muted }]}>
            {streak === 1 ? 'Welcome back! Keep your streak going.' : `${streak} days in a row — keep it up!`}
          </Text>

          {/* Coin reward */}
          <Animated.View style={[
            styles.rewardBox,
            { backgroundColor: theme.colors.coin + '12', borderColor: theme.colors.coin + '30', transform: [{ scale: coinBounce }] },
          ]}>
            <Text style={styles.coinEmoji}>🪙</Text>
            <View>
              <Text style={[styles.rewardLabel, { color: theme.colors.muted }]}>Coins Earned</Text>
              <Text style={[styles.rewardAmount, { color: theme.colors.coin }]}>+{coinsAdded}</Text>
            </View>
            {milestoneBonus > 0 && (
              <View style={[styles.bonusPill, { backgroundColor: '#FFB800' }]}>
                <Text style={styles.bonusPillText}>+{milestoneBonus} BONUS!</Text>
              </View>
            )}
          </Animated.View>

          {/* Breakdown if milestone */}
          {milestoneBonus > 0 && (
            <Text style={[styles.breakdown, { color: theme.colors.muted }]}>
              Base reward: +{baseCoins} · Milestone bonus: +{milestoneBonus}
            </Text>
          )}

          {/* Progress hint */}
          <View style={[styles.progressRow, { backgroundColor: theme.colors.background }]}>
            {[7, 10, 20, 30].map((target) => {
              const reached = streak >= target;
              return (
                <View key={target} style={styles.progressItem}>
                  <View style={[
                    styles.progressDot,
                    { backgroundColor: reached ? theme.colors.primary : theme.colors.border },
                  ]}>
                    {reached && <Text style={{ fontSize: 8 }}>✓</Text>}
                  </View>
                  <Text style={[styles.progressLabel, { color: reached ? theme.colors.primary : theme.colors.muted }]}>
                    {target}d
                  </Text>
                </View>
              );
            })}
          </View>

          {/* CTA */}
          <TouchableOpacity
            onPress={onClose}
            style={[styles.ctaBtn, { backgroundColor: theme.colors.primary }]}
            activeOpacity={0.85}
          
            accessibilityRole="button"
            accessibilityLabel="Awesome! Lets Play 🎮"
            hitSlop={8}>
            <Text style={styles.ctaText}>Awesome! Lets Play 🎮</Text>
          </TouchableOpacity>

          <Text style={[styles.footer, { color: theme.colors.muted }]}>
            Come back tomorrow to grow your streak!
          </Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  centerer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 28,
    padding: 24,
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 20,
  },
  topAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  streakBadge: {
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 28,
    paddingVertical: 16,
    marginTop: 12,
    marginBottom: 12,
    minWidth: 120,
  },
  streakEmoji: { fontSize: 36, marginBottom: 4 },
  streakDayLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  streakNumber: { fontSize: 52, fontWeight: '900', lineHeight: 56 },
  streakText: { fontSize: 13, fontWeight: '600', marginTop: -4 },
  milestoneBanner: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 12,
  },
  milestoneText: { fontSize: 14, fontWeight: '800' },
  title: { fontSize: 24, fontWeight: '900', marginBottom: 6, textAlign: 'center' },
  sub: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  rewardBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 10,
    width: '100%',
    position: 'relative',
  },
  coinEmoji: { fontSize: 40 },
  rewardLabel: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
  rewardAmount: { fontSize: 34, fontWeight: '900' },
  bonusPill: {
    position: 'absolute',
    top: -10,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  bonusPillText: { color: '#000', fontWeight: '900', fontSize: 10 },
  breakdown: { fontSize: 12, marginBottom: 16 },
  progressRow: {
    flexDirection: 'row',
    gap: 20,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 20,
  },
  progressItem: { alignItems: 'center', gap: 4 },
  progressDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressLabel: { fontSize: 10, fontWeight: '700' },
  ctaBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  ctaText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  footer: { fontSize: 11, textAlign: 'center' },
});
