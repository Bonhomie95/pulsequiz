import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Coins, PlayCircle, ShoppingBag } from 'lucide-react-native';
import { useTheme } from '@/src/theme/useTheme';
import { useCoinStore } from '@/src/store/useCoinStore';

export default function WalletScreen() {
  const theme = useTheme();
  const { coins } = useCoinStore();

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* HEADER */}
      <Text style={[styles.title, { color: theme.colors.text }]}>Wallet</Text>

      {/* BALANCE CARD */}
      <View
        style={[styles.balanceCard, { backgroundColor: theme.colors.surface }]}
      >
        <Coins size={34} color={theme.colors.coin} />
        <Text style={[styles.balance, { color: theme.colors.text }]}>
          {coins}
        </Text>
        <Text style={{ color: theme.colors.muted }}>Available Coins</Text>
      </View>

      {/* ACTIONS */}
      <View style={styles.actions}>
        {/* WATCH AD */}
        <TouchableOpacity
          activeOpacity={0.9}
          style={[styles.actionCard, { backgroundColor: theme.colors.primary }]}
          onPress={() => {
            // hook AdMob / rewarded video here later
            console.log('Watch ad');
          }}
        >
          <PlayCircle size={22} color="#fff" />
          <View>
            <Text style={styles.actionTitle}>Watch Video</Text>
            <Text style={styles.actionSub}>Earn free coins</Text>
          </View>
        </TouchableOpacity>

        {/* BUY COINS */}
        <TouchableOpacity
          activeOpacity={0.9}
          style={[
            styles.actionCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.primary,
              borderWidth: 1.5,
            },
          ]}
          onPress={() => {
            // future store / IAP
            console.log('Open store');
          }}
        >
          <ShoppingBag size={22} color={theme.colors.primary} />
          <View>
            <Text style={[styles.actionTitle, { color: theme.colors.text }]}>
              Buy Coins
            </Text>
            <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
              Unlock more power
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* INFO */}
      <View style={styles.info}>
        <Text style={{ color: theme.colors.muted, fontSize: 13 }}>
          💡 Coins are used for hints, retries, streak boosts and premium
          features.
        </Text>
      </View>
    </SafeAreaView>
  );
}

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },

  title: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 24,
  },

  balanceCard: {
    borderRadius: 20,
    paddingVertical: 28,
    alignItems: 'center',
    marginBottom: 32,
  },

  balance: {
    fontSize: 36,
    fontWeight: '900',
    marginVertical: 6,
  },

  actions: {
    gap: 16,
  },

  actionCard: {
    flexDirection: 'row',
    gap: 14,
    padding: 18,
    borderRadius: 18,
    alignItems: 'center',
  },

  actionTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  actionSub: {
    color: '#fff',
    opacity: 0.85,
    fontSize: 12,
  },

  info: {
    marginTop: 32,
  },
});
