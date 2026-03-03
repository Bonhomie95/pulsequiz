import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Animated, StyleSheet, Modal,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Swords, Home, RotateCcw, X, Check, Clock } from 'lucide-react-native';

import { usePvPStore } from '@/src/store/usePvPStore';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useTheme } from '@/src/theme/useTheme';
import { soundManager } from '@/src/audio/SoundManager';
import { showInterstitialAd } from '@/src/ads/admob';
import { getSocket } from '@/src/socket/socket';
import { SOCKET_EVENTS } from '@/src/socket/events';
import { AVATAR_MAP } from '@/src/constants/avatars';

function resolveAvatar(key?: string | null) {
  if (!key) return AVATAR_MAP.avatar0;
  return AVATAR_MAP[key as keyof typeof AVATAR_MAP] ?? AVATAR_MAP.avatar0;
}

export default function PvPResultScreen() {
  const theme = useTheme();
  const router = useRouter();
  const socket = getSocket();
  const playedRef = useRef(false);
  const confettiAnim = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(60)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  const { winnerUserId, me, opponent, category, wager } = usePvPStore();
  const myUserId = useAuthStore.getState().user?.id;
  const isWinner = winnerUserId === myUserId;
  const isDraw = !winnerUserId;

  // Rematch state
  const [rematchState, setRematchState] = useState<'idle' | 'requesting' | 'waiting' | 'incoming'>('idle');
  const [rematchTimeout, setRematchTimeout] = useState<number | null>(null);
  const rematchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (playedRef.current) return;
    playedRef.current = true;

    (async () => {
      if (isWinner) {
        soundManager.play('victory');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (!isDraw) {
        soundManager.play('fail');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      await showInterstitialAd();
    })();

    // Entry animations
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(slideUp, { toValue: 0, friction: 7, useNativeDriver: true }),
    ]).start();

    return () => { soundManager.stopEffects(); };
  }, []);

  // Rematch socket listeners
  useEffect(() => {
    socket.on(SOCKET_EVENTS.REMATCH_REQUEST, ({ fromUserId }: { fromUserId: string }) => {
      if (fromUserId === opponent?.userId) {
        setRematchState('incoming');
        startRematchCountdown();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    });

    socket.on(SOCKET_EVENTS.REMATCH_ACCEPTED, () => {
      clearRematchTimer();
      // Both join queue with rematchWith targeting each other
      usePvPStore.getState().reset();
      router.replace(`/quiz/pvp/search?category=${encodeURIComponent(category ?? 'General Knowledge')}&wager=${wager}&rematchWith=${opponent?.userId}` as any);
    });

    socket.on(SOCKET_EVENTS.REMATCH_DECLINED, () => {
      clearRematchTimer();
      setRematchState('idle');
    });

    return () => {
      socket.off(SOCKET_EVENTS.REMATCH_REQUEST);
      socket.off(SOCKET_EVENTS.REMATCH_ACCEPTED);
      socket.off(SOCKET_EVENTS.REMATCH_DECLINED);
    };
  }, [opponent?.userId, category, wager]);

  const startRematchCountdown = () => {
    setRematchTimeout(30);
    rematchTimerRef.current = setInterval(() => {
      setRematchTimeout((t) => {
        if (t === null || t <= 1) {
          clearRematchTimer();
          setRematchState('idle');
          return null;
        }
        return t - 1;
      });
    }, 1000);
  };

  const clearRematchTimer = () => {
    if (rematchTimerRef.current) {
      clearInterval(rematchTimerRef.current);
      rematchTimerRef.current = null;
    }
    setRematchTimeout(null);
  };

  const requestRematch = () => {
    if (!opponent?.userId || !category) return;
    setRematchState('waiting');
    socket.emit(SOCKET_EVENTS.REMATCH_REQUEST, {
      opponentId: opponent.userId,
      category,
      wager: wager ?? 0,
    });
    startRematchCountdown();
  };

  const acceptRematch = () => {
    if (!opponent?.userId || !category) return;
    clearRematchTimer();
    socket.emit(SOCKET_EVENTS.REMATCH_ACCEPTED, {
      opponentId: opponent.userId,
      category,
      wager: wager ?? 0,
    });
    // Also join the queue ourselves
    usePvPStore.getState().reset();
    router.replace(`/quiz/pvp/search?category=${encodeURIComponent(category ?? 'General Knowledge')}&wager=${wager}&rematchWith=${opponent?.userId}` as any);
  };

  const declineRematch = () => {
    if (!opponent?.userId) return;
    clearRematchTimer();
    setRematchState('idle');
    socket.emit(SOCKET_EVENTS.REMATCH_DECLINED, { opponentId: opponent.userId });
  };

  const goHome = () => {
    usePvPStore.getState().reset();
    router.replace('/(tabs)/home');
  };

  const playAgain = () => {
    usePvPStore.getState().reset();
    router.replace('/quiz/mode');
  };

  const winCoins = isWinner ? 50 : 20;
  const winPts = isWinner ? 50 : 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Animated.View style={{ flex: 1, opacity: fadeIn }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* RESULT EMOJI + TITLE */}
          <View style={styles.heroSection}>
            <Animated.View style={{ transform: [{ translateY: slideUp }] }}>
              <Text style={styles.resultEmoji}>
                {isDraw ? '🤝' : isWinner ? '🏆' : '💀'}
              </Text>
              <Text style={[styles.resultTitle, {
                color: isDraw ? theme.colors.muted : isWinner ? theme.colors.primary : '#FF5C5C'
              }]}>
                {isDraw ? "It's a Draw!" : isWinner ? 'You Win!' : 'You Lost'}
              </Text>
              <Text style={[styles.resultSub, { color: theme.colors.muted }]}>
                {isDraw ? 'Evenly matched!' : isWinner ? 'Outstanding performance 🔥' : 'Better luck next time'}
              </Text>
            </Animated.View>
          </View>

          {/* VS PLAYER CARDS */}
          <View style={styles.versusRow}>
            {/* Me */}
            <PlayerCard
              username={me?.username ?? 'You'}
              avatar={me?.avatar}
              level={me?.level}
              isWinner={isWinner}
              isSelf
              theme={theme}
            />
            <View style={styles.vsCircle}>
              <Text style={{ fontSize: 14, fontWeight: '900', color: theme.colors.muted }}>VS</Text>
            </View>
            {/* Opponent */}
            <PlayerCard
              username={opponent?.username ?? 'Opponent'}
              avatar={opponent?.avatar}
              level={opponent?.level}
              isWinner={!isWinner && !isDraw}
              theme={theme}
            />
          </View>

          {/* REWARDS CARD */}
          <Animated.View
            style={[
              styles.rewardsCard,
              { backgroundColor: theme.colors.surface, transform: [{ translateY: slideUp }] }
            ]}
          >
            <Text style={[styles.rewardsLabel, { color: theme.colors.muted }]}>
              Rewards Earned
            </Text>
            <View style={styles.rewardsRow}>
              <View style={styles.rewardItem}>
                <Text style={[styles.rewardValue, { color: theme.colors.coin }]}>
                  +{winCoins}
                </Text>
                <Text style={[styles.rewardUnit, { color: theme.colors.muted }]}>🪙 Coins</Text>
              </View>
              <View style={[styles.rewardDivider, { backgroundColor: theme.colors.border }]} />
              <View style={styles.rewardItem}>
                <Text style={[styles.rewardValue, { color: theme.colors.primary }]}>
                  +{winPts}
                </Text>
                <Text style={[styles.rewardUnit, { color: theme.colors.muted }]}>⭐ Points</Text>
              </View>
              {wager > 0 && (
                <>
                  <View style={[styles.rewardDivider, { backgroundColor: theme.colors.border }]} />
                  <View style={styles.rewardItem}>
                    <Text style={[styles.rewardValue, { color: isWinner ? '#4ADE80' : '#FF5C5C' }]}>
                      {isWinner ? `+${wager}` : `-${wager}`}
                    </Text>
                    <Text style={[styles.rewardUnit, { color: theme.colors.muted }]}>💰 Wager</Text>
                  </View>
                </>
              )}
            </View>
          </Animated.View>

          {/* REMATCH INCOMING BANNER */}
          {rematchState === 'incoming' && (
            <View style={[styles.rematchBanner, { backgroundColor: theme.colors.primary + '22', borderColor: theme.colors.primary }]}>
              <Swords size={18} color={theme.colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rematchBannerTitle, { color: theme.colors.primary }]}>
                  {opponent?.username} wants a rematch!
                </Text>
                {rematchTimeout !== null && (
                  <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                    Expires in {rematchTimeout}s
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={declineRematch} style={styles.rematchIconBtn}>
                <X size={16} color="#FF5C5C" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={acceptRematch}
                style={[styles.rematchIconBtn, { backgroundColor: theme.colors.primary }]}
              >
                <Check size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          {/* WAITING BANNER */}
          {rematchState === 'waiting' && (
            <View style={[styles.rematchBanner, { backgroundColor: '#FFB80022', borderColor: '#FFB800' }]}>
              <Clock size={18} color="#FFB800" />
              <Text style={{ color: '#FFB800', flex: 1, fontWeight: '600' }}>
                Rematch request sent... waiting ({rematchTimeout}s)
              </Text>
              <TouchableOpacity onPress={() => { clearRematchTimer(); setRematchState('idle'); }}>
                <Text style={{ color: '#FF5C5C', fontWeight: '700', fontSize: 13 }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ACTIONS */}
          <View style={styles.actions}>
            {/* REMATCH */}
            {rematchState === 'idle' && opponent && (
              <TouchableOpacity
                onPress={requestRematch}
                style={[styles.btn, styles.btnPrimary, { backgroundColor: theme.colors.primary }]}
              >
                <RotateCcw size={18} color="#fff" />
                <Text style={styles.btnPrimaryText}>
                  Request Rematch
                </Text>
              </TouchableOpacity>
            )}

            {/* PLAY AGAIN */}
            <TouchableOpacity
              onPress={playAgain}
              style={[styles.btn, styles.btnSecondary, {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              }]}
            >
              <Swords size={18} color={theme.colors.text} />
              <Text style={[styles.btnSecondaryText, { color: theme.colors.text }]}>
                New Match
              </Text>
            </TouchableOpacity>

            {/* HOME */}
            <TouchableOpacity onPress={goHome} style={styles.homeLink}>
              <Home size={16} color={theme.colors.muted} />
              <Text style={[styles.homeLinkText, { color: theme.colors.muted }]}>Back to Home</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

function PlayerCard({
  username, avatar, level, isWinner, isSelf, theme,
}: {
  username: string;
  avatar?: string | null;
  level?: number;
  isWinner: boolean;
  isSelf?: boolean;
  theme: any;
}) {
  const AvatarImg = resolveAvatar(avatar);
  return (
    <View style={[
      styles.playerCard,
      {
        backgroundColor: theme.colors.surface,
        borderColor: isWinner ? theme.colors.primary : 'transparent',
        borderWidth: isWinner ? 2 : 0,
      }
    ]}>
      {isWinner && (
        <Text style={styles.winnerCrown}>👑</Text>
      )}
      <View style={[styles.playerAvatar, { backgroundColor: theme.colors.primary + '22' }]}>
        {AvatarImg ? (
          <AvatarImg width={44} height={44} />
        ) : (
          <Text style={{ fontSize: 24 }}>👤</Text>
        )}
      </View>
      <Text style={[styles.playerName, { color: isWinner ? theme.colors.primary : theme.colors.text }]} numberOfLines={1}>
        {isSelf ? 'You' : username}
      </Text>
      {level !== undefined && (
        <Text style={[styles.playerLevel, { color: theme.colors.muted }]}>Lv {level}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 60, flexGrow: 1 },
  heroSection: { alignItems: 'center', paddingVertical: 24 },
  resultEmoji: { fontSize: 64, textAlign: 'center', marginBottom: 8 },
  resultTitle: { fontSize: 34, fontWeight: '900', textAlign: 'center' },
  resultSub: { fontSize: 15, textAlign: 'center', marginTop: 4 },
  versusRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 10, marginBottom: 20,
  },
  playerCard: {
    flex: 1, borderRadius: 20, padding: 14,
    alignItems: 'center', gap: 6, position: 'relative',
  },
  winnerCrown: { position: 'absolute', top: -12, fontSize: 20 },
  playerAvatar: {
    width: 60, height: 60, borderRadius: 30,
    justifyContent: 'center', alignItems: 'center',
  },
  playerName: { fontSize: 14, fontWeight: '800', textAlign: 'center' },
  playerLevel: { fontSize: 11 },
  vsCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#1F2937', justifyContent: 'center', alignItems: 'center',
  },
  rewardsCard: {
    borderRadius: 22, padding: 20, marginBottom: 20,
  },
  rewardsLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14, textAlign: 'center' },
  rewardsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  rewardItem: { alignItems: 'center', flex: 1 },
  rewardValue: { fontSize: 28, fontWeight: '900' },
  rewardUnit: { fontSize: 12, marginTop: 2 },
  rewardDivider: { width: 1, height: 40 },
  rematchBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, borderRadius: 16, borderWidth: 1.5, marginBottom: 16,
  },
  rematchBannerTitle: { fontWeight: '700', fontSize: 14 },
  rematchIconBtn: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#FF5C5C22',
  },
  actions: { gap: 12 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 18, borderRadius: 18,
  },
  btnPrimary: {},
  btnPrimaryText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  btnSecondary: { borderWidth: 1.5 },
  btnSecondaryText: { fontWeight: '800', fontSize: 15 },
  homeLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10,
  },
  homeLinkText: { fontSize: 14, fontWeight: '600' },
});
