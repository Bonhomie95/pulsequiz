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
} from 'lucide-react-native';
import { useTheme } from '@/src/theme/useTheme';
import { useCoinStore } from '@/src/store/useCoinStore';
import { useRouter } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import { PayoutChecklist, type Eligibility } from '@/src/components/PayoutChecklist';
import { api, errorMessage } from '@/src/api/api';
import { showRewardedAd } from '@/src/ads/admob';
import { useAppStateStore } from '@/src/store/useAppStateStore';
import { CoinRewardToast } from '@/src/components/CoinRewardToast';

type Payout = {
  _id: string;
  amount: number;
  rank: number;
  period: string;
  periodLabel: string;
  status: 'pending' | 'sent' | 'confirmed' | 'failed' | 'skipped';
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
};

export default function WalletScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { coins } = useCoinStore();
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
    if (status === 'confirmed' || status === 'sent')
      return <CheckCircle size={16} color={color} />;
    if (status === 'failed' || status === 'skipped')
      return <XCircle size={16} color={color} />;
    return <Clock size={16} color={color} />;
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
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
        <PayoutChecklist eligibility={eligibility} />

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

        {/* USDT EARNINGS CARD */}
        {payoutData && (
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
              Total USDT Earned
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

        {/* ADDRESS WARNING */}
        <View
          style={[
            styles.warningCard,
            { backgroundColor: '#FF5C5C15', borderColor: '#FF5C5C40' },
          ]}
        >
          <AlertTriangle size={16} color="#FF5C5C" />
          <Text
            style={{
              color: '#FF5C5C',
              fontSize: 12,
              flex: 1,
              marginLeft: 8,
              lineHeight: 18,
            }}
          >
            <Text style={{ fontWeight: '800' }}>CONFIRM YOUR USDT ADDRESS</Text>{' '}
            in Profile → Settings before Saturday or you may forfeit your prize.
          </Text>
        </View>

        {/* ACTIONS */}
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          Earn Coins
        </Text>
        <View style={styles.actions}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[
              styles.actionCard,
              { backgroundColor: theme.colors.primary },
            ]}
            onPress={handleWatchAd}
            disabled={adLoading}
          
            accessibilityRole="button"
            accessibilityLabel="Watch Video"
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
          </TouchableOpacity>

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

        {/* PAYOUT HISTORY */}
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          USDT Payout History
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
              No payouts yet. Rank in the top players to earn USDT!
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
                    ${p.amount.toFixed(2)} USDT
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
                  {p.status}
                </Text>
              </View>
            </View>
          ))
        )}

        <Text style={[styles.footerNote, { color: theme.colors.muted }]}>
          💡 Coins are for hints, wagers & boosts. USDT is earned by ranking in
          the top players each week/month.
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
