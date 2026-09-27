import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Animated,
  StyleSheet,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Swords, Home, RotateCcw, X, Check, Clock } from 'lucide-react-native';

import { usePvPStore } from '@/src/store/usePvPStore';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useTheme } from '@/src/theme/useTheme';
import { soundManager } from '@/src/audio/SoundManager';
import { showInterstitialAd } from '@/src/ads/admob';
import { getSocket } from '@/src/socket/socket';
import { SOCKET_EVENTS } from '@/src/socket/events';
import { UserAvatar } from '@/src/components/UserAvatar';

export default function PvPResultScreen() {
  const theme = useTheme();
  const router = useRouter();
  const socket = getSocket();
  const playedRef = useRef(false);
  const confettiAnim = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(60)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  const store = usePvPStore();
  const { winnerUserId, me } = store;

  /**
   * Hold on to who we played and what we played.
   *
   * The store is shared session state and several listeners reset it — an
   * ERROR arriving while this screen is open is enough. When that happened the
   * rematch button had no opponent to name and told the player the match was
   * no longer available, which was true of the store and nothing else. These
   * latch the first non-null value and survive any later reset.
   */
  // Read from the route first. The store is shared session state that several
  // listeners reset — an ERROR arriving on this screen was enough to leave the
  // rematch button with no opponent to name, and it told the player the match
  // was no longer available, which was true of the store and nothing else.
  const params = useLocalSearchParams<{
    opponentId?: string;
    opponentName?: string;
    matchCategory?: string;
    matchWager?: string;
  }>();

  // The store still supplies avatar and level for display; the route supplies
  // the identity the rematch needs, which is the part that must not vanish.
  const opponent =
    store.opponent ??
    (params.opponentId
      ? {
          userId: params.opponentId,
          username: params.opponentName ?? 'Opponent',
          avatar: '',
          level: 1,
        }
      : null);

  const rematchOpponentId = params.opponentId || store.opponent?.userId || '';
  const category = params.matchCategory || store.category;
  const wager = Number(params.matchWager ?? store.wager ?? 0);
  const myUserId = useAuthStore.getState().user?.id;
  const isWinner = winnerUserId === myUserId;
  const isDraw = !winnerUserId;

  // Rematch state
  const [rematchState, setRematchState] = useState<
    'idle' | 'requesting' | 'waiting' | 'incoming'
  >('idle');
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
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(slideUp, {
        toValue: 0,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    return () => {
      soundManager.stopEffects();
    };
  }, []);

  // Rematch socket listeners
  useEffect(() => {
    const onRequest = ({ fromUserId }: { fromUserId: string }) => {
      if (fromUserId === rematchOpponentId) {
        setRematchState('incoming');
        startRematchCountdown();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    };
    const onAccepted = () => {
      // Nothing to do but wait: once both sides have agreed the server builds
      // the match and sends MATCH_FOUND, which navigates us into it. Sending
      // ourselves back to the matchmaking queue here is what used to make a
      // rematch depend on two clients finding each other again.
      clearRematchTimer();
      setRematchState('waiting');
    };
    const onDeclined = ({ reason }: { reason?: string } = {}) => {
      clearRematchTimer();
      setRematchState('idle');
      Alert.alert(
        reason === 'offline' ? 'Opponent has left' : 'Rematch declined',
        reason === 'offline'
          ? `${opponent?.username ?? 'They'} is no longer online.`
          : `${opponent?.username ?? 'They'} declined the rematch.`,
      );
    };

    // Navigating into the match lived only on the search screen, so a rematch
    // built while both players sat here arrived with nobody to act on it.
    const onMatchFound = (payload: any) => {
      clearRematchTimer();
      // Set the pairing from the payload rather than trusting that the
      // app-wide listener already did. The search screen has always done this;
      // here it was left to the shared listener, so anything that cleared the
      // store between MATCH_FOUND and the VS screen mounting left that screen
      // with no players to draw and no match to start.
      const myId = useAuthStore.getState().user?.id;
      if (myId && payload?.matchId) {
        usePvPStore.getState().setMatched({
          matchId: payload.matchId,
          players: payload.players ?? [],
          myUserId: myId,
          wager: payload.wager ?? 0,
          category: payload.category ?? null,
        });
      }
      router.replace('/quiz/pvp/vs');
    };

    socket.on(SOCKET_EVENTS.REMATCH_REQUEST, onRequest);
    socket.on(SOCKET_EVENTS.REMATCH_ACCEPTED, onAccepted);
    socket.on(SOCKET_EVENTS.REMATCH_DECLINED, onDeclined);
    socket.on(SOCKET_EVENTS.MATCH_FOUND, onMatchFound);

    return () => {
      socket.off(SOCKET_EVENTS.REMATCH_REQUEST, onRequest);
      socket.off(SOCKET_EVENTS.REMATCH_ACCEPTED, onAccepted);
      socket.off(SOCKET_EVENTS.REMATCH_DECLINED, onDeclined);
      socket.off(SOCKET_EVENTS.MATCH_FOUND, onMatchFound);
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
    // Returning silently here made the button look dead. It can only happen
    // if the match details were lost (a reload, or the store reset underneath
    // us), and the player deserves to know why nothing happened.
    if (!rematchOpponentId || !category) {
      Alert.alert(
        "Can't request a rematch",
        'This match is no longer available. Start a new game instead.',
      );
      return;
    }
    setRematchState('waiting');
    socket.emit(SOCKET_EVENTS.REMATCH_REQUEST, {
      opponentId: rematchOpponentId,
      category,
      wager: wager ?? 0,
    });
    startRematchCountdown();
  };

  const acceptRematch = () => {
    if (!rematchOpponentId || !category) return;
    clearRematchTimer();
    setRematchState('waiting');
    socket.emit(SOCKET_EVENTS.REMATCH_ACCEPTED, {
      opponentId: rematchOpponentId,
      category,
      wager: wager ?? 0,
    });
    // The server pairs us and sends MATCH_FOUND; no queue round trip.
  };

  const declineRematch = () => {
    if (!opponent?.userId) return;
    clearRematchTimer();
    setRematchState('idle');
    socket.emit(SOCKET_EVENTS.REMATCH_DECLINED, {
      opponentId: rematchOpponentId,
    });
  };

  const goHome = () => {
    usePvPStore.getState().reset();
    router.replace('/(tabs)/home');
  };

  const playAgain = () => {
    // Back to the friends list, not the mode picker: you just finished a 1v1,
    // so the next thing you want is another opponent, not to re-choose the
    // kind of game.
    usePvPStore.getState().reset();
    router.replace('/friends');
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
              <Text
                style={[
                  styles.resultTitle,
                  {
                    color: isDraw
                      ? theme.colors.muted
                      : isWinner
                        ? theme.colors.primary
                        : '#FF5C5C',
                  },
                ]}
              >
                {isDraw ? "It's a Draw!" : isWinner ? 'You Win!' : 'You Lost'}
              </Text>
              <Text style={[styles.resultSub, { color: theme.colors.muted }]}>
                {isDraw
                  ? 'Evenly matched!'
                  : isWinner
                    ? 'Outstanding performance 🔥'
                    : 'Better luck next time'}
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
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '900',
                  color: theme.colors.muted,
                }}
              >
                VS
              </Text>
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
              {
                backgroundColor: theme.colors.surface,
                transform: [{ translateY: slideUp }],
              },
            ]}
          >
            <Text style={[styles.rewardsLabel, { color: theme.colors.muted }]}>
              Rewards Earned
            </Text>
            <View style={styles.rewardsRow}>
              <View style={styles.rewardItem}>
                <Text
                  style={[styles.rewardValue, { color: theme.colors.coin }]}
                >
                  +{winCoins}
                </Text>
                <Text
                  style={[styles.rewardUnit, { color: theme.colors.muted }]}
                >
                  🪙 Coins
                </Text>
              </View>
              <View
                style={[
                  styles.rewardDivider,
                  { backgroundColor: theme.colors.border },
                ]}
              />
              <View style={styles.rewardItem}>
                <Text
                  style={[styles.rewardValue, { color: theme.colors.primary }]}
                >
                  +{winPts}
                </Text>
                <Text
                  style={[styles.rewardUnit, { color: theme.colors.muted }]}
                >
                  ⭐ Points
                </Text>
              </View>
              {wager > 0 && (
                <>
                  <View
                    style={[
                      styles.rewardDivider,
                      { backgroundColor: theme.colors.border },
                    ]}
                  />
                  <View style={styles.rewardItem}>
                    <Text
                      style={[
                        styles.rewardValue,
                        { color: isWinner ? '#4ADE80' : '#FF5C5C' },
                      ]}
                    >
                      {isWinner ? `+${wager}` : `-${wager}`}
                    </Text>
                    <Text
                      style={[styles.rewardUnit, { color: theme.colors.muted }]}
                    >
                      💰 Wager
                    </Text>
                  </View>
                </>
              )}
            </View>
          </Animated.View>

          {/* REMATCH INCOMING BANNER */}
          {rematchState === 'incoming' && (
            <View
              style={[
                styles.rematchBanner,
                {
                  backgroundColor: theme.colors.primary + '22',
                  borderColor: theme.colors.primary,
                },
              ]}
            >
              <Swords size={18} color={theme.colors.primary} />
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.rematchBannerTitle,
                    { color: theme.colors.primary },
                  ]}
                >
                  {opponent?.username} wants a rematch!
                </Text>
                {rematchTimeout !== null && (
                  <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                    Expires in {rematchTimeout}s
                  </Text>
                )}
              </View>
              <TouchableOpacity
                onPress={declineRematch}
                accessibilityRole="button"
                accessibilityLabel="Decline rematch"
                style={styles.rematchIconBtn}
            hitSlop={8}>
                <X size={16} color="#FF5C5C" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={acceptRematch}
                style={[
                  styles.rematchIconBtn,
                  { backgroundColor: theme.colors.primary },
                ]}
              
            accessibilityRole="button"
            hitSlop={8}
            accessibilityLabel="Confirm">
                <Check size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          {/* WAITING BANNER */}
          {rematchState === 'waiting' && (
            <View
              style={[
                styles.rematchBanner,
                { backgroundColor: '#FFB80022', borderColor: '#FFB800' },
              ]}
            >
              <Clock size={18} color="#FFB800" />
              <Text style={{ color: '#FFB800', flex: 1, fontWeight: '600' }}>
                Rematch request sent... waiting ({rematchTimeout}s)
              </Text>
              <TouchableOpacity
                onPress={() => {
                  clearRematchTimer();
                  setRematchState('idle');
                }}
              
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            hitSlop={8}>
                <Text
                  style={{ color: '#FF5C5C', fontWeight: '700', fontSize: 13 }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ACTIONS */}
          <View style={styles.actions}>
            {/* REMATCH */}
            {rematchState === 'idle' && opponent && (
              <TouchableOpacity
                onPress={requestRematch}
                style={[
                  styles.btn,
                  styles.btnPrimary,
                  { backgroundColor: theme.colors.primary },
                ]}
              
            accessibilityRole="button"
            accessibilityLabel="Request Rematch"
            hitSlop={8}>
                <RotateCcw size={18} color="#fff" />
                <Text style={styles.btnPrimaryText}>Request Rematch</Text>
              </TouchableOpacity>
            )}

            {/* PLAY AGAIN */}
            <TouchableOpacity
              onPress={playAgain}
              style={[
                styles.btn,
                styles.btnSecondary,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            
            accessibilityRole="button"
            accessibilityLabel="New Match"
            hitSlop={8}>
              <Swords size={18} color={theme.colors.text} />
              <Text
                style={[styles.btnSecondaryText, { color: theme.colors.text }]}
              >
                New Match
              </Text>
            </TouchableOpacity>

            {/* HOME */}
            <TouchableOpacity onPress={goHome} style={styles.homeLink}
            accessibilityRole="button"
            accessibilityLabel="Back to Home"
            hitSlop={8}>
              <Home size={16} color={theme.colors.muted} />
              <Text
                style={[styles.homeLinkText, { color: theme.colors.muted }]}
              >
                Back to Home
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

function PlayerCard({
  username,
  avatar,
  level,
  isWinner,
  isSelf,
  theme,
}: {
  username: string;
  avatar?: string | null;
  level?: number;
  isWinner: boolean;
  isSelf?: boolean;
  theme: any;
}) {
  return (
    <View
      style={[
        styles.playerCard,
        {
          backgroundColor: theme.colors.surface,
          borderColor: isWinner ? theme.colors.primary : 'transparent',
          borderWidth: isWinner ? 2 : 0,
        },
      ]}
    >
      {isWinner && <Text style={styles.winnerCrown}>👑</Text>}
      <View
        style={[
          styles.playerAvatar,
          { backgroundColor: theme.colors.primary + '22' },
        ]}
      >
        <UserAvatar avatar={avatar} size={44} />
      </View>
      <Text
        style={[
          styles.playerName,
          { color: isWinner ? theme.colors.primary : theme.colors.text },
        ]}
        numberOfLines={1}
      >
        {isSelf ? 'You' : username}
      </Text>
      {level !== undefined && (
        <Text style={[styles.playerLevel, { color: theme.colors.muted }]}>
          Lv {level}
        </Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  playerCard: {
    flex: 1,
    borderRadius: 20,
    padding: 14,
    alignItems: 'center',
    gap: 6,
    position: 'relative',
  },
  winnerCrown: { position: 'absolute', top: -12, fontSize: 20 },
  playerAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerName: { fontSize: 14, fontWeight: '800', textAlign: 'center' },
  playerLevel: { fontSize: 11 },
  vsCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1F2937',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rewardsCard: {
    borderRadius: 22,
    padding: 20,
    marginBottom: 20,
  },
  rewardsLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 14,
    textAlign: 'center',
  },
  rewardsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  rewardItem: { alignItems: 'center', flex: 1 },
  rewardValue: { fontSize: 28, fontWeight: '900' },
  rewardUnit: { fontSize: 12, marginTop: 2 },
  rewardDivider: { width: 1, height: 40 },
  rematchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    marginBottom: 16,
  },
  rematchBannerTitle: { fontWeight: '700', fontSize: 14 },
  rematchIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FF5C5C22',
  },
  actions: { gap: 12 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    borderRadius: 18,
  },
  btnPrimary: {},
  btnPrimaryText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  btnSecondary: { borderWidth: 1.5 },
  btnSecondaryText: { fontWeight: '800', fontSize: 15 },
  homeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  homeLinkText: { fontSize: 14, fontWeight: '600' },
});
