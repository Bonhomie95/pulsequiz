import { useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LEADERBOARD_DATA } from '../../src/constants/leaderboard';
import { useTheme } from '../../src/theme/useTheme';

type Tab = 'weekly' | 'monthly' | 'all';

export default function LeaderboardScreen() {
  const theme = useTheme();
  const [tab, setTab] = useState<Tab>('weekly');

  const data = LEADERBOARD_DATA[tab];

  return (
    <SafeAreaView
      edges={['top']}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <View style={styles.container}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Leaderboard
        </Text>

        {/* Tabs */}
        <View style={styles.tabs}>
          {(['weekly', 'monthly', 'all'] as Tab[]).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={[
                styles.tab,
                {
                  backgroundColor:
                    tab === t ? theme.colors.primary : theme.colors.surface,
                },
              ]}
            >
              <Text style={{ color: theme.colors.text }}>
                {t === 'weekly'
                  ? 'Weekly'
                  : t === 'monthly'
                  ? 'Monthly'
                  : 'All Time'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Podium */}
        <View style={styles.podium}>
          {data.slice(0, 3).map((u, i) => (
            <View
              key={u.id}
              style={[
                styles.podiumCard,
                {
                  backgroundColor: theme.colors.surface,
                  marginTop: i === 0 ? 0 : 20,
                },
              ]}
            >
              <Text style={{ fontSize: 20 }}>{i === 0 ? '👑' : i + 1}</Text>
              <Text style={{ color: theme.colors.text }}>{u.name}</Text>
              <Text style={{ color: theme.colors.coin }}>{u.points}</Text>
            </View>
          ))}
        </View>

        {/* List */}
        <FlatList
          data={data.slice(3)}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item, index }) => (
            <View
              style={[
                styles.row,
                {
                  backgroundColor: item.isMe
                    ? theme.colors.primary
                    : theme.colors.surface,
                },
              ]}
            >
              <Text style={{ color: theme.colors.text }}>
                {index + 4}. {item.name}
              </Text>
              <Text style={{ color: theme.colors.coin }}>{item.points}</Text>
            </View>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 16,
  },
  tabs: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  podium: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  podiumCard: {
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    width: '30%',
  },
  row: {
    padding: 16,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
});
