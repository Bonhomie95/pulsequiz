import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Coins,
  PlayCircle,
  ShoppingBag,
  Trophy,
  Clock,
  CheckCircle,
  XCircle,
  ChevronLeft,
  AlertTriangle,
  TrendingUp,
  Wallet2,
} from 'lucide-react-native';
import { useTheme } from '@/src/theme/useTheme';
import { useCoinStore } from '@/src/store/useCoinStore';
import { useRouter } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import { PayoutChecklist, type Eligibility } from '@/src/components/PayoutChecklist';
import { api, errorMessage } from '@/src/api/api';
import { showRewardedAd, rewardedAdsAvailable } from '@/src/ads/admob';
import { useAppStateStore } from '@/src/store/useAppStateStore';
import { CoinRewardToast } from '@/src/components/CoinRewardToast';
import { RulesSheet } from '@/src/components/RulesSheet';
import { useAuthStore, usePrizesAvailable } from '@/src/store/useAuthStore';

type Payout = {
  _id: string;
  amount: number;
  rank: number;
  period: string;
  periodLabel: string;
  status: 'pending' | 'processing' | 'sent' | 'confirmed' | 'failed' | 'skipped' | 'superseded';
  currency?: 'USDT' | 'USDC';
  usdtType?: string;
  txHash?: string;
  createdAt: string;
};

type PayoutData = {
  payouts: Payout[];
  pendingUSDT: number;
  totalEarned: number;
};

const STATUS_COLOR: Record<string, string> = {
  pending: '#FFC94A',
  sent: '#5B7CFF',
  confirmed: '#4ADE80',
  failed: '#FF5C5C',
  skipped: '#A6B0CF',
  processing: '#5B7CFF',
  superseded: '#A6B0CF',
};

/** Plain-language status; "superseded" means it was paid inside a later payout. */
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  processing: 'Sending',
  sent: 'Sent',
  confirmed: 'Confirmed',
  failed: 'Retrying',
  skipped: 'On hold',
  superseded: 'Paid later',
};

export default function WalletScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { coins } = useCoinStore();
  const user = useAuthStore((st) => st.user);
  const prizes = usePrizesAvailable();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [payoutData, setPayoutData] = useState<PayoutData | null>(null);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [adLoading, setAdLoading] = useState(false);
  const [coinToast, setCoinToast] = useState({ visible: false, coins: 0 });

  const fetchPayouts = useCallback(async () => {
    try {
      setFetchError(null);
      const [payouts, elig] = await Promise.all([
        api.get('/payouts/mine'),
        // Same checklist the payout job runs, so the user can see exactly what
        // is still blocking them rather than being silently skipped.
        api.get('/settings/payout-eligibility'),
      ]);
      setPayoutData(payouts.data);
      setEligibility(elig.data);
    } catch (e) {
      setFetchError(errorMessage(e, "Couldn't load your earnings."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPayouts();
  }, [fetchPayouts]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPayouts();
  };

  const handleWatchAd = async () => {
    setAdLoading(true);
    try {
      // Show actual rewarded ad first
      const success = await showRewardedAd();
      if (!success) {
        Alert.alert('Ad unavailable', 'No ad available right now. Try again later.');
        return;
      }
      // Then credit server-side. With AdMob server-side verification enabled
      // the coins arrive from Google's callback rather than this response, so
      // send the user to the dedicated screen which knows how to wait for it.
      const res = await api.post('/ads/reward');
      useAppStateStore.getState().markRewardedAdWatched();

      if (res.data?.pending) {
        Alert.alert(
          'Reward on its way',
          'The ad network is confirming your reward — your balance will update shortly.',
        );
      } else if (res.data?.coins !== undefined) {
        useCoinStore.getState().setCoins(res.data.coins);
        setCoinToast({ visible: true, coins: res.data.added ?? 0 });
      } else if (res.data?.message) {
        Alert.alert('Try again', res.data.message);
      }
    } catch (e: any) {
      if (e.response?.status === 429) {
        Alert.alert('Daily limit reached', errorMessage(e, 'Come back tomorrow for more free coins!'));
      } else {
        Alert.alert('Error', 'Could not load ad. Try again later.');
      }
    } finally {
      setAdLoading(false);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const StatusIcon = ({ status }: { status: string }) => {
    const color = STATUS_COLOR[status] ?? '#A6B0CF';
    if (status === 'confirmed' || status === 'sent' || status === 'superseded')
      return <CheckCircle size={16} color={color} />;
    if (status === 'skipped')
      return <XCircle size={16} color={color} />;
    return <Clock size={16} color={color} />;
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <RulesSheet visible={rulesOpen} onClose={() => setRulesOpen(false)} />
      <CoinRewardToast
        visible={coinToast.visible}
        coins={coinToast.coins}
        label="Ad Reward!"
        onHide={() => setCoinToast({ visible: false, coins: 0 })}
      />
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}
            accessibilityRole="button"
            hitSlop={8}
            accessibilityLabel="Go back">
          <ChevronLeft size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.text }]}>Wallet</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* COINS CARD */}
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Coins size={32} color={theme.colors.coin} />
          <Text style={[styles.bigValue, { color: theme.colors.coin }]}>
            {coins}
          </Text>
          <Text style={[styles.label, { color: theme.colors.muted }]}>
            Available Coins
          </Text>
        </View>

        {/* PAYOUT ELIGIBILITY — what is still blocking a payout, if anything */}
        {prizes && <PayoutChecklist eligibility={eligibility} />}

        {fetchError && (
          <View
            style={[
              styles.warningCard,
              { backgroundColor: theme.colors.danger + '15', borderColor: theme.colors.danger + '40' },
            ]}
          >
            <Text style={{ color: theme.colors.danger, fontWeight: '700', fontSize: 13 }}>
              {fetchError}
            </Text>
            <TouchableOpacity
              onPress={fetchPayouts}
              accessibilityRole="button"
              accessibilityLabel="Retry loading earnings"
              hitSlop={8}
              style={{ marginTop: 8 }}
            >
              <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* PRIZE EARNINGS CARD */}
        {prizes && payoutData && (
          <View
            style={[
              styles.card,
              { backgroundColor: theme.colors.surface, marginTop: 12 },
            ]}
          >
            <TrendingUp size={28} color="#4ADE80" />
            <Text style={[styles.bigValue, { color: '#4ADE80' }]}>
              ${payoutData.totalEarned.toFixed(2)}
            </Text>
            <Text style={[styles.label, { color: theme.colors.muted }]}>
              Total Prizes Earned (USD)
            </Text>
            {payoutData.pendingUSDT > 0 && (
              <View
                style={[styles.pendingBadge, { backgroundColor: '#FFC94A20' }]}
              >
                <Clock size={12} color="#FFC94A" />
                <Text style={{ color: '#FFC94A', fontSize: 12, marginLeft: 4 }}>
                  ${payoutData.pendingUSDT.toFixed(2)} accumulating toward $5
                  minimum
                </Text>
              </View>
            )}
          </View>
        )}

        {/* PRIZE WALLET — what payouts will be sent to */}
        {prizes && (
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/settings')}
          accessibilityRole="button"
          accessibilityLabel={
            user?.usdtAddress
              ? `Prize wallet ${user.payoutCurrency ?? 'USDT'} on ${user.usdtType}. Change in Settings`
              : 'Add a USDT or USDC wallet in Settings'
          }
          style={[
            styles.warningCard,
            user?.usdtAddress
              ? { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }
              : { backgroundColor: theme.colors.danger + '15', borderColor: theme.colors.danger + '40' },
          ]}
        >
          {user?.usdtAddress ? (
            <Wallet2 size={16} color={theme.colors.primary} />
          ) : (
            <AlertTriangle size={16} color={theme.colors.danger} />
          )}
          <Text
            style={{
              color: user?.usdtAddress ? theme.colors.text : theme.colors.danger,
              fontSize: 12,
              flex: 1,
              marginLeft: 8,
              lineHeight: 18,
            }}
          >
            {user?.usdtAddress ? (
              <>
                <Text style={{ fontWeight: '800' }}>
                  Prizes go to {user.payoutCurrency ?? 'USDT'} · {user.usdtType}
                </Text>
                {'\n'}
                {user.usdtAddress.slice(0, 8)}…{user.usdtAddress.slice(-6)} — tap to change
              </>
            ) : (
              <>
                <Text style={{ fontWeight: '800' }}>ADD A PRIZE WALLET</Text>{' '}
                {"Save a USDT or USDC address in Settings — a winner without a wallet misses that period's payout."}
              </>
            )}
          </Text>
        </TouchableOpacity>
        )}

        {/* ACTIONS */}
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          Earn Coins
        </Text>
        <View style={styles.actions}>
          {rewardedAdsAvailable && <TouchableOpacity
            activeOpacity={0.85}
            style={[
              styles.actionCard,
              { backgroundColor: theme.colors.primary },
            ]}
            onPress={handleWatchAd}
            disabled={adLoading}
          
            accessibilityRole="button"
            accessibilityLabel="Watch a video to earn free coins"
            accessibilityState={{ disabled: adLoading, busy: adLoading }}
            hitSlop={8}>
            {adLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <PlayCircle size={22} color="#fff" />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.actionTitle}>Watch Video</Text>
              <Text style={styles.actionSub}>Earn free coins (max 5/day)</Text>
            </View>
          </TouchableOpacity>}

          <TouchableOpacity
            activeOpacity={0.85}
            style={[
              styles.actionCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.primary,
                borderWidth: 1.5,
              },
            ]}
            onPress={() => router.push('/earn/buy')}
          
            accessibilityRole="button"
            accessibilityLabel="Buy Coins"
            hitSlop={8}>
            <ShoppingBag size={22} color={theme.colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionTitle, { color: theme.colors.text }]}>
                Buy Coins
              </Text>
              <Text style={[styles.actionSub, { color: theme.colors.muted }]}>
                Unlock hints & wager power
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* PAYOUT HISTORY — kept visible if they were ever paid */}
        {(prizes || (payoutData?.payouts.length ?? 0) > 0) && (
        <>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          Prize Payout History
        </Text>

        {loading ? (
          <ActivityIndicator
            color={theme.colors.primary}
            style={{ marginTop: 20 }}
          />
        ) : !payoutData || payoutData.payouts.length === 0 ? (
          <View
            style={[
              styles.emptyState,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <Trophy size={32} color={theme.colors.muted} />
            <Text style={[styles.emptyText, { color: theme.colors.muted }]}>
              No payouts yet. Finish in a paying rank to win USDT or USDC!
            </Text>
          </View>
        ) : (
          payoutData.payouts.map((p) => (
            <View
              key={p._id}
              style={[
                styles.payoutRow,
                { backgroundColor: theme.colors.surface },
              ]}
            >
              <View style={styles.payoutLeft}>
                <StatusIcon status={p.status} />
                <View style={{ marginLeft: 10 }}>
                  <Text
                    style={[styles.payoutAmount, { color: theme.colors.text }]}
                  >
                    ${p.amount.toFixed(2)} {p.currency ?? 'USDT'}
                  </Text>
                  <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                    Rank #{p.rank} • {p.period} • {p.periodLabel}
                  </Text>
                  <Text style={{ color: theme.colors.muted, fontSize: 11 }}>
                    {formatDate(p.createdAt)}
                  </Text>
                </View>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: STATUS_COLOR[p.status] + '20' },
                ]}
              >
                <Text
                  style={{
                    color: STATUS_COLOR[p.status],
                    fontSize: 11,
                    fontWeight: '700',
                    textTransform: 'capitalize',
                  }}
                >
                  {STATUS_LABEL[p.status] ?? p.status}
                </Text>
              </View>
            </View>
          ))
        )}
        </>
        )}

        <Text style={[styles.footerNote, { color: theme.colors.muted }]}>
          💡 Coins are for hints, wagers & boosts and have no cash value.
          {prizes ? ' Prizes (USDT/USDC) come only from your leaderboard rank.' : ''}{' '}
          <Text
            onPress={() => setRulesOpen(true)}
            accessibilityRole="link"
            style={{ color: theme.colors.primary, fontWeight: '700' }}
          >
            {prizes ? 'Rules & prizes' : 'How it works'}
          </Text>
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '800' },
  scroll: { padding: 16, paddingBottom: 100 },
  card: { borderRadius: 20, paddingVertical: 24, alignItems: 'center', gap: 6 },
  bigValue: { fontSize: 36, fontWeight: '900' },
  label: { fontSize: 13 },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginTop: 6,
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 24,
    marginBottom: 10,
  },
  actions: { gap: 12 },
  actionCard: {
    flexDirection: 'row',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  actionTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  actionSub: { color: '#ffffffcc', fontSize: 12, marginTop: 2 },
  emptyState: { borderRadius: 16, padding: 24, alignItems: 'center', gap: 10 },
  emptyText: { textAlign: 'center', fontSize: 13, lineHeight: 20 },
  payoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
  },
  payoutLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  payoutAmount: { fontSize: 15, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  footerNote: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 18,
  },
});
