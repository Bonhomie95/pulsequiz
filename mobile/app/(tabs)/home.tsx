import { useFocusEffect, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import {
  Monitor,
  Moon,
  Sun,
  Coins,
  Flame,
  Trophy,
  PlayCircle,
  Crown,
  HelpCircle,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { AdBanner } from '@/src/ads/adBanner';
import { api, errorMessage } from '@/src/api/api';
import { HomeSkeleton } from '@/src/components/HomeSkeleton';
import { CheckInModal } from '@/src/components/CheckInModal';
import { RulesSheet } from '@/src/components/RulesSheet';
import { UserAvatar } from '@/src/components/UserAvatar';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useCoinStore } from '@/src/store/useCoinStore';
import { useProgressStore } from '@/src/store/useProgressStore';
import { useStreakStore } from '@/src/store/useStreakStore';
import { useThemeStore } from '@/src/store/useThemeStore';
import { usePremiumStore } from '@/src/store/usePremiumStore';
import { useTheme } from '@/src/theme/useTheme';
import { timeAgo } from '@/src/utils/timeAgo';
import { soundManager } from '@/src/audio/SoundManager';
import { useAudioStore } from '@/src/store/useAudioStore';
import { enterImmersiveMode } from '@/src/utils/immersive';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/src/constants/storageKeys';

const todayKey = () => {
  const now = new Date();
  const gmt1 = new Date(now.getTime() + 60 * 60 * 1000);
  return gmt1.toISOString().slice(0, 10);
};

type ReadyPlayer = { _id: string; username: string; avatar?: string | null };

function ReadyCarousel({
  players,
  onPress,
}: {
  players: ReadyPlayer[];
  onPress: (p: ReadyPlayer) => void;
}) {
  const theme = useTheme();
  const listRef = useRef<FlatList>(null);
  const indexRef = useRef(0);
  // Pause auto-scroll when Home isn't the focused tab (it stays mounted).
  const isFocused = useIsFocused();

  useEffect(() => {
    if (!isFocused || players.length <= 1) return;
    const iv = setInterval(() => {
      const next = (indexRef.current + 1) % players.length;
      indexRef.current = next;
      listRef.current?.scrollToIndex({ index: next, animated: true });
    }, 2800);
    return () => clearInterval(iv);
  }, [players.length, isFocused]);

  if (players.length === 0) return null;

  return (
    <View style={{ marginBottom: 20 }}>
      <View style={styles.carouselHeader}>
        <View style={styles.liveDot} />
        <Text style={[styles.carouselTitle, { color: theme.colors.text }]}>
          Ready to Play
        </Text>
        <Text style={[styles.carouselCount, { color: theme.colors.muted }]}>
          {players.length} online
        </Text>
      </View>
      <FlatList
        ref={listRef}
        data={players}
        keyExtractor={(p) => p._id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10 }}
        renderItem={({ item }) => {
          return (
            <TouchableOpacity
              onPress={() => onPress(item)}
              accessibilityRole="button"
              accessibilityLabel={`Challenge ${item.username} to a match`}
              style={[
                styles.carouselCard,
                { backgroundColor: theme.colors.surface },
              ]}
              activeOpacity={0.8}
            hitSlop={8}>
              <View
                style={[
                  styles.carouselAvatar,
                  { backgroundColor: theme.colors.primary + '22' },
                ]}
              >
                <UserAvatar avatar={item.avatar} size={38} />
              </View>
              <Text
                style={[styles.carouselName, { color: theme.colors.text }]}
                numberOfLines={1}
              >
                {item.username}
              </Text>
              <View
                style={[
                  styles.challengeChip,
                  { backgroundColor: theme.colors.primary },
                ]}
              >
                <Text style={styles.challengeChipText}>⚔️ Play</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuthStore();
  const { mode, setMode } = useThemeStore();
  const { isPremium } = usePremiumStore();
  const [loading, setLoading] = useState(true);
  const { coins } = useCoinStore();
  const { streak } = useStreakStore();
  const [lastCategory, setLastCategory] = useState<string | null>(null);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [lastPlayedAt, setLastPlayedAt] = useState<string | null>(null);

  // Check-in modal state
  const [checkInModal, setCheckInModal] = useState({
    visible: false,
    coinsAdded: 0,
    milestoneBonus: 0,
  });

  const [myWeeklyRank, setMyWeeklyRank] = useState<number | null>(null);
  const [myMonthlyRank, setMyMonthlyRank] = useState<number | null>(null);
  const [myAllTimeRank, setMyAllTimeRank] = useState<number | null>(null);
  const [rankTab, setRankTab] = useState<'weekly' | 'monthly' | 'all'>(
    'weekly',
  );
  const [readyPlayers, setReadyPlayers] = useState<ReadyPlayer[]>([]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    useCoinStore.getState().hydrate();
    useProgressStore.getState().hydrate();
    useStreakStore.getState().hydrate();
  }, []);

  const [homeError, setHomeError] = useState<string | null>(null);

  const loadHome = useCallback(
    async (opts: { showSpinner?: boolean } = {}) => {
      if (opts.showSpinner !== false) setLoading(true);
      setHomeError(null);
      try {
          const check = await api.post('/streak/check-in');
          const [res, playersRes] = await Promise.all([
            api.get('/home/summary'),
            api
              .get('/home/ready-players')
              .catch(() => ({ data: { players: [] } })),
          ]);
          useCoinStore.getState().setCoins(res.data.coins);
          useStreakStore
            .getState()
            .setFromBackend(res.data.streak, res.data.lastCheckIn);
          setLastCategory(res.data.lastQuiz?.category ?? null);
          setLastScore(
            typeof res.data.lastQuiz?.score === 'number'
              ? res.data.lastQuiz.score
              : null,
          );
          setLastPlayedAt(res.data.lastQuiz?.playedAt ?? null);
          setMyWeeklyRank(
            typeof res.data.myWeeklyRank === 'number'
              ? res.data.myWeeklyRank
              : null,
          );
          setMyMonthlyRank(
            typeof res.data.myMonthlyRank === 'number'
              ? res.data.myMonthlyRank
              : null,
          );
          setMyAllTimeRank(
            typeof res.data.myAllTimeRank === 'number'
              ? res.data.myAllTimeRank
              : null,
          );
          setReadyPlayers(playersRes.data.players ?? []);

          // ── Show check-in modal if this is a new check-in today ──────────
          if (!check.data.alreadyCheckedIn && check.data.coinsAdded > 0) {
            const today = todayKey();
            const lastShown = await AsyncStorage.getItem(
              STORAGE_KEYS.CHECKIN_TOAST_DATE,
            );
            if (lastShown !== today) {
              await AsyncStorage.setItem(
                STORAGE_KEYS.CHECKIN_TOAST_DATE,
                today,
              );
              setCheckInModal({
                visible: true,
                coinsAdded: check.data.coinsAdded ?? 0,
                milestoneBonus: check.data.milestoneBonus ?? 0,
              });
            }
          }
      } catch (e) {
        setHomeError(errorMessage(e, "Couldn't refresh your home screen."));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        if (active) await loadHome();
      })();
      return () => {
        active = false;
      };
    }, [loadHome]),
  );

  useFocusEffect(
    useCallback(() => {
      enterImmersiveMode();
    }, []),
  );

  useEffect(() => {
    (async () => {
      const { muted, masterVolume, effectsVolume } = useAudioStore.getState();
      await soundManager.boot();
      soundManager.setMuted(muted);
      soundManager.setMasterVolume(masterVolume);
      soundManager.setEffectsVolume(effectsVolume);
      await soundManager.startBackground();
    })();
  }, []);

  const cycleTheme = () => {
    const next =
      mode === 'system' ? 'dark' : mode === 'dark' ? 'light' : 'system';
    setMode(next);
    api.patch('/settings', { theme: next });
  };
  const ThemeIcon = mode === 'system' ? Monitor : mode === 'dark' ? Moon : Sun;
  const greetingHour = new Date().getHours();
  const greeting =
    greetingHour < 12
      ? 'Good morning'
      : greetingHour < 17
        ? 'Good afternoon'
        : 'Good evening';

  const handleCarouselChallenge = (player: ReadyPlayer) => {
    router.push({
      pathname: '/quiz/pvp/search',
      params: {
        category: 'General Knowledge',
        challengeUser: player._id,
        challengeName: player.username,
      },
    } as any);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* ── How the game works ── */}
      <RulesSheet visible={rulesOpen} onClose={() => setRulesOpen(false)} />

      {/* ── Daily Check-In Modal ── */}
      <CheckInModal
        visible={checkInModal.visible}
        streak={streak}
        coinsAdded={checkInModal.coinsAdded}
        milestoneBonus={checkInModal.milestoneBonus}
        onClose={() => setCheckInModal((s) => ({ ...s, visible: false }))}
      />

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              try {
                await loadHome({ showSpinner: false });
              } finally {
                setRefreshing(false);
              }
            }}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/profile')}
            style={styles.profileRow}
            accessibilityRole="button"
            accessibilityLabel="Open your profile"
          >
            <View
              style={[styles.avatarRing, { borderColor: theme.colors.primary }]}
            >
              <UserAvatar avatar={user?.avatar} size={45} />
            </View>
            <View>
              <Text style={[styles.greeting, { color: theme.colors.muted }]}>
                {greeting}
              </Text>
              <Text style={[styles.username, { color: theme.colors.text }]}>
                {user?.username ?? 'Player'}
              </Text>
            </View>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {/* Premium badge / upsell */}
            <TouchableOpacity
              onPress={() => router.push('/premium' as any)}
              accessibilityRole="button"
              accessibilityLabel={isPremium ? 'Premium active' : 'Get premium'}
              style={[
                styles.premiumBtn,
                {
                  backgroundColor: isPremium
                    ? '#FFB800' + '22'
                    : theme.colors.surface,
                },
              ]}
            >
              <Crown
                size={16}
                color={isPremium ? '#FFB800' : theme.colors.muted}
              />
              {isPremium && (
                <Text style={[styles.premiumBtnText, { color: '#FFB800' }]}>
                  PRO
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={cycleTheme}
              accessibilityRole="button"
              accessibilityLabel="Change theme"
              style={[
                styles.themeBtn,
                { backgroundColor: theme.colors.surface },
              ]}
            >
              <ThemeIcon size={18} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* STATS BAR */}
        {loading ? (
          <HomeSkeleton />
        ) : (
          <View
            style={[styles.statsBar, { backgroundColor: theme.colors.surface }]}
          >
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => router.push('/wallet')}
            
            accessibilityRole="button"
            accessibilityLabel="Open your wallet"
            hitSlop={8}>
              <Coins size={18} color={theme.colors.coin} />
              <Text style={[styles.statValue, { color: theme.colors.coin }]}>
                {coins.toLocaleString()}
              </Text>
              <Text style={[styles.statLabel, { color: theme.colors.muted }]}>
                Coins
              </Text>
            </TouchableOpacity>
            <View
              style={[styles.statDiv, { backgroundColor: theme.colors.border }]}
            />
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => router.push('/streak')}
            
            accessibilityRole="button"
            accessibilityLabel="View your daily streak"
            hitSlop={8}>
              <Flame size={18} color="#FF6B35" />
              <Text style={[styles.statValue, { color: theme.colors.text }]}>
                {streak}
              </Text>
              <Text style={[styles.statLabel, { color: theme.colors.muted }]}>
                Streak
              </Text>
            </TouchableOpacity>
            {myWeeklyRank !== null && (
              <>
                <View
                  style={[
                    styles.statDiv,
                    { backgroundColor: theme.colors.border },
                  ]}
                />
                <TouchableOpacity
                  style={styles.statItem}
                  onPress={() => router.push('/(tabs)/leaderboard')}
                
            accessibilityRole="button"
            accessibilityLabel="Open the weekly leaderboard"
            hitSlop={8}>
                  <Trophy size={18} color="#FFB800" />
                  <Text style={[styles.statValue, { color: '#FFB800' }]}>
                    #{myWeeklyRank}
                  </Text>
                  <Text
                    style={[styles.statLabel, { color: theme.colors.muted }]}
                  >
                    Weekly
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* RANK CARD */}
        {!loading && (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => router.push('/(tabs)/leaderboard')}
            style={[styles.rankCard, { backgroundColor: theme.colors.surface }]}
          
            accessibilityRole="button"
            accessibilityLabel="Open the leaderboard"
            hitSlop={8}>
            <View style={styles.rankCardTop}>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
              >
                <Trophy size={16} color="#FFB800" />
                <Text
                  style={[styles.rankCardTitle, { color: theme.colors.text }]}
                >
                  Your Rankings
                </Text>
              </View>
              <View style={styles.rankTabs}>
                {(['weekly', 'monthly', 'all'] as const).map((t) => (
                  <TouchableOpacity
                    key={t}
                    accessibilityRole="tab"
                    accessibilityLabel={`Show ${t} rank`}
                    accessibilityState={{ selected: rankTab === t }}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      setRankTab(t);
                    }}
                    style={[
                      styles.rankTabBtn,
                      {
                        backgroundColor:
                          rankTab === t ? theme.colors.primary : 'transparent',
                      },
                    ]}
            hitSlop={8}>
                    <Text
                      style={{
                        color: rankTab === t ? '#fff' : theme.colors.muted,
                        fontSize: 10,
                        fontWeight: '700',
                      }}
                    >
                      {t === 'weekly' ? 'W' : t === 'monthly' ? 'M' : 'All'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {(() => {
              const rank =
                rankTab === 'weekly'
                  ? myWeeklyRank
                  : rankTab === 'monthly'
                    ? myMonthlyRank
                    : myAllTimeRank;
              const label =
                rankTab === 'weekly'
                  ? 'This Week'
                  : rankTab === 'monthly'
                    ? 'This Month'
                    : 'All Time';
              return rank !== null ? (
                <View style={styles.rankDisplay}>
                  <Text style={[styles.rankNumber, { color: '#FFB800' }]}>
                    #{rank}
                  </Text>
                  <View>
                    <Text
                      style={[styles.rankLabel, { color: theme.colors.text }]}
                    >
                      {label}
                    </Text>
                    <Text
                      style={[styles.rankSub, { color: theme.colors.muted }]}
                    >
                      Tap to see full leaderboard →
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.rankDisplay}>
                  <Text style={{ fontSize: 28 }}>🎯</Text>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.rankLabel, { color: theme.colors.text }]}
                    >
                      Not ranked yet
                      {rankTab === 'weekly'
                        ? ' this week'
                        : rankTab === 'monthly'
                          ? ' this month'
                          : ''}
                    </Text>
                    <Text
                      style={[styles.rankSub, { color: theme.colors.muted }]}
                    >
                      Play a quiz to appear on the leaderboard!
                    </Text>
                  </View>
                </View>
              );
            })()}
          </TouchableOpacity>
        )}

        {homeError && (
          <View
            style={{
              backgroundColor: theme.colors.danger + '15',
              borderColor: theme.colors.danger + '40',
              borderWidth: 1.5,
              borderRadius: 14,
              padding: 12,
              marginBottom: 16,
            }}
          >
            <Text style={{ color: theme.colors.danger, fontWeight: '700', fontSize: 13 }}>
              {homeError}
            </Text>
            <TouchableOpacity
              onPress={() => loadHome()}
              accessibilityRole="button"
              accessibilityLabel="Retry loading your home screen"
              hitSlop={8}
              style={{ marginTop: 8 }}
            >
              <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>
                Try again
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* READY TO PLAY CAROUSEL */}
        {!loading && (
          <ReadyCarousel
            players={readyPlayers}
            onPress={handleCarouselChallenge}
          />
        )}

        {/* HOW IT WORKS — the rules have real consequences (one wrong answer
            ends a run, the daily cap zeroes points) and were never explained. */}
        <TouchableOpacity
          onPress={() => setRulesOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Read how PulseQuiz works"
          hitSlop={8}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            alignSelf: 'flex-start',
            marginBottom: 14,
          }}
        >
          <HelpCircle size={14} color={theme.colors.muted} />
          <Text style={{ color: theme.colors.muted, fontSize: 13, fontWeight: '700' }}>
            How it works
          </Text>
        </TouchableOpacity>

        {/* MAIN PLAY CARD */}
        <TouchableOpacity
          onPress={() => router.push('/quiz/mode' as any)}
          activeOpacity={0.9}
        
            accessibilityRole="button"
            accessibilityLabel="Start a Quiz"
            hitSlop={8}>
          <LinearGradient
            colors={[theme.colors.primary, theme.colors.secondary + 'BB']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.playCard}
          >
            <PlayCircle size={40} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={styles.playTitle}>Start a Quiz</Text>
              <Text style={styles.playSub}>Solo · PvP · Play With Friends</Text>
            </View>
            <View style={styles.playChip}>
              <Text
                style={{
                  color: theme.colors.primary,
                  fontWeight: '800',
                  fontSize: 11,
                }}
              >
                PLAY
              </Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* QUICK ACTIONS */}
        <Text style={[styles.section, { color: theme.colors.text }]}>
          Quick Actions
        </Text>
        <View style={styles.grid}>
          {[
            {
              icon: '🎯',
              label: 'Challenges',
              sub: 'Earn coins daily',
              color: '#7C3AED',
              route: '/challenges',
            },
            {
              icon: '👥',
              label: 'Friends',
              sub: 'Challenge someone',
              color: theme.colors.primary,
              route: '/friends',
            },
            {
              icon: '🏆',
              label: 'Leaderboard',
              sub: 'See your rank',
              color: '#F59E0B',
              route: '/(tabs)/leaderboard',
            },
            {
              icon: '💰',
              label: 'Wallet',
              sub: 'Coins & payouts',
              color: '#10B981',
              route: '/wallet',
            },
          ].map((a) => (
            <TouchableOpacity
              key={a.label}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              onPress={() => router.push(a.route as any)}
              style={[
                styles.actionCard,
                { backgroundColor: theme.colors.surface },
              ]}
              activeOpacity={0.85}
            hitSlop={8}>
              <View
                style={[styles.actionIcon, { backgroundColor: a.color + '22' }]}
              >
                <Text style={{ fontSize: 22 }}>{a.icon}</Text>
              </View>
              <Text style={[styles.actionLabel, { color: theme.colors.text }]}>
                {a.label}
              </Text>
              <Text style={[styles.actionSub, { color: theme.colors.muted }]}>
                {a.sub}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* LAST QUIZ */}
        {lastCategory && (
          <>
            <Text style={[styles.section, { color: theme.colors.text }]}>
              Last Quiz
            </Text>
            <View
              style={[
                styles.lastQuiz,
                { backgroundColor: theme.colors.surface },
              ]}
            >
              <View
                style={[
                  styles.catBubble,
                  { backgroundColor: theme.colors.primary + '22' },
                ]}
              >
                <Text style={{ fontSize: 20 }}>📚</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.catName, { color: theme.colors.text }]}>
                  {lastCategory}
                </Text>
                <Text style={[styles.catMeta, { color: theme.colors.muted }]}>
                  {lastScore !== null ? `Score: ${lastScore}` : ''}
                  {lastPlayedAt ? `  •  ${timeAgo(lastPlayedAt)}` : ''}
                </Text>
              </View>
            </View>
          </>
        )}

        {/* EARN ROW */}
        <Text style={[styles.section, { color: theme.colors.text }]}>
          Earn More Coins
        </Text>
        <View style={styles.earnRow}>
          {[
            {
              icon: '📺',
              label: 'Watch Ad',
              sub: '+10 coins',
              route: '/earn/ads',
            },
            {
              icon: '🛒',
              label: 'Buy Coins',
              sub: 'Packages',
              route: '/earn/buy',
            },
            { icon: '👑', label: 'Premium', sub: 'Ad-Free', route: '/premium' },
            {
              icon: '🔗',
              label: 'Referral',
              sub: '+50 coins',
              route: '/referral',
            },
          ].map((e) => (
            <TouchableOpacity
              key={e.label}
              accessibilityRole="button"
              accessibilityLabel={e.label}
              onPress={() => router.push(e.route as any)}
              style={[
                styles.earnCard,
                { backgroundColor: theme.colors.surface },
              ]}
            hitSlop={8}>
              <Text style={{ fontSize: 22 }}>{e.icon}</Text>
              <Text
                style={{
                  fontWeight: '700',
                  fontSize: 12,
                  color: theme.colors.text,
                }}
              >
                {e.label}
              </Text>
              <Text style={{ fontSize: 10, color: theme.colors.muted }}>
                {e.sub}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* AD BANNER — hidden for premium */}
        <View style={[styles.adWrap, { borderColor: theme.colors.border }]}>
          <AdBanner />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 120 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarRing: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2.5,
    overflow: 'hidden',
  },
  avatar: { width: '100%', height: '100%' },
  greeting: { fontSize: 12 },
  username: { fontSize: 17, fontWeight: '700' },
  premiumBtn: {
    height: 40,
    paddingHorizontal: 10,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  premiumBtnText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  themeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsBar: {
    flexDirection: 'row',
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 8,
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 20,
  },
  statItem: { alignItems: 'center', gap: 3, flex: 1 },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 11 },
  statDiv: { width: 1, height: 36 },
  rankCard: { borderRadius: 20, padding: 16, marginBottom: 20 },
  rankCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  rankCardTitle: { fontSize: 14, fontWeight: '700' },
  rankTabs: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 20,
    padding: 3,
  },
  rankTabBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16 },
  rankDisplay: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  rankNumber: { fontSize: 40, fontWeight: '900' },
  rankLabel: { fontSize: 15, fontWeight: '700' },
  rankSub: { fontSize: 12, marginTop: 2 },
  carouselHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ADE80' },
  carouselTitle: { fontSize: 15, fontWeight: '700', flex: 1 },
  carouselCount: { fontSize: 12 },
  carouselCard: {
    width: 100,
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    gap: 6,
  },
  carouselAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  carouselName: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  challengeChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  challengeChipText: { fontSize: 10, color: '#fff', fontWeight: '800' },
  playCard: {
    borderRadius: 22,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 24,
  },
  playTitle: { color: '#fff', fontSize: 19, fontWeight: '900' },
  playSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },
  playChip: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  section: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  actionCard: {
    width: '47%',
    borderRadius: 18,
    padding: 16,
    alignItems: 'flex-start',
    gap: 8,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabel: { fontSize: 14, fontWeight: '700' },
  actionSub: { fontSize: 12 },
  lastQuiz: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 18,
    padding: 16,
    marginBottom: 24,
  },
  catBubble: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  catName: { fontSize: 15, fontWeight: '700' },
  catMeta: { fontSize: 12, marginTop: 3 },
  earnRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  earnCard: {
    flex: 1,
    borderRadius: 14,
    padding: 10,
    alignItems: 'center',
    gap: 3,
  },
  adWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    minHeight: 52,
    justifyContent: 'center',
  },
});
