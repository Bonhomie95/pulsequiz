import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';

import { api } from '@/src/api/api';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useTheme } from '@/src/theme/useTheme';

type Tab = 'weekly' | 'monthly' | 'all';

type Entry = {
  userId: string;
  username: string;
  avatar?: string;
  points: number;
  rank?: number;
  previousRank?: number;
};

export default function LeaderboardScreen() {
  const theme = useTheme();
  const userId = useAuthStore((s) => s.user?.id);
  const listRef = useRef<FlatList<Entry>>(null);

  const podiumAnim = useRef(new Animated.Value(0)).current;
  const jumpAnim = useRef(new Animated.Value(0)).current;

  const [tab, setTab] = useState<Tab>('weekly');
  const [data, setData] = useState<Entry[]>([]);
  const [myIndex, setMyIndex] = useState<number | null>(null);

  const winSound = useRef<Audio.Sound | null>(null);
  const loseSound = useRef<Audio.Sound | null>(null);

  /* ---------------- FETCH ---------------- */

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const res = await api.get(`/leaderboard/${tab}`);
        const list: Entry[] = res.data?.data ?? [];

        if (!mounted) return;

        setData(list);

        const idx = list.findIndex((u) => u.userId === userId);
        setMyIndex(idx >= 0 ? idx : null);

        Animated.spring(podiumAnim, {
          toValue: 1,
          useNativeDriver: true,
          friction: 6,
        }).start();

        Animated.timing(jumpAnim, {
          toValue: idx != null && idx >= 3 ? 1 : 0,
          duration: 300,
          useNativeDriver: true,
        }).start();
      } catch (e) {
        console.error(e);
        setData([]);
        setMyIndex(null);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [tab]);

  /* ---------------- SOUNDS ---------------- */

  useEffect(() => {
    (async () => {
      winSound.current = new Audio.Sound();
      loseSound.current = new Audio.Sound();

      await winSound.current.loadAsync(
        require('../../assets/sounds/victory.mp3')
      );
      await loseSound.current.loadAsync(
        require('../../assets/sounds/fail.mp3')
      );
    })();

    return () => {
      winSound.current?.unloadAsync();
      loseSound.current?.unloadAsync();
    };
  }, []);

  useEffect(() => {
    if (myIndex === 0) winSound.current?.replayAsync();
    else if (myIndex != null) loseSound.current?.replayAsync();
  }, [myIndex]);

  /* ---------------- SCROLL ---------------- */

  const scrollToMe = () => {
    if (myIndex == null || myIndex < 3) return;

    listRef.current?.scrollToIndex({
      index: myIndex - 3,
      animated: true,
      viewPosition: 0.5,
    });
  };

  const podium = data.slice(0, 3);
  const rest = data.slice(3);

  /* ---------------- UI ---------------- */

  return (
    <SafeAreaView
      edges={['top']}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <View style={styles.container}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Leaderboard 🏆
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
          {podium[1] && (
            <AnimatedPodiumCard place={2} data={podium[1]} anim={podiumAnim} />
          )}

          {podium[0] && (
            <AnimatedPodiumCard
              place={1}
              data={podium[0]}
              anim={podiumAnim}
              crown
            />
          )}

          {podium[2] && (
            <AnimatedPodiumCard place={3} data={podium[2]} anim={podiumAnim} />
          )}
        </View>

        {/* Floating Jump */}
        {myIndex != null && myIndex >= 3 && (
          <Animated.View
            style={[
              styles.jumpFloating,
              {
                transform: [
                  {
                    scale: jumpAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 1],
                    }),
                  },
                ],
                opacity: jumpAnim,
              },
            ]}
          >
            <TouchableOpacity onPress={scrollToMe}>
              <Text style={styles.jumpText}>⬇ Jump to me</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* List */}
        <FlatList
          ref={listRef}
          data={rest}
          keyExtractor={(i) => i.userId}
          contentContainerStyle={{ paddingBottom: 80 }}
          renderItem={({ item, index }) => {
            const rank = index + 4;
            const isMe = item.userId === userId;

            let delta = '•';
            if (item.previousRank != null) {
              if (item.previousRank > rank) delta = '↑';
              else if (item.previousRank < rank) delta = '↓';
            }

            return (
              <View
                style={[
                  styles.row,
                  {
                    backgroundColor: isMe
                      ? theme.colors.primary
                      : theme.colors.surface,
                  },
                ]}
              >
                <Text style={{ color: theme.colors.text }}>
                  {rank}. {item.username} {delta}
                </Text>
                <Text style={{ color: theme.colors.coin }}>{item.points}</Text>
              </View>
            );
          }}
        />
      </View>
    </SafeAreaView>
  );
}

/* ---------------- PODIUM CARD ---------------- */

function AnimatedPodiumCard({
  place,
  data,
  anim,
  crown,
}: {
  place: 1 | 2 | 3;
  data: Entry;
  anim: Animated.Value;
  crown?: boolean;
}) {
  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [30, place === 1 ? -10 : 10],
  });

  const scale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, place === 1 ? 1.1 : 1],
  });

  return (
    <Animated.View
      style={[
        styles.podiumCard,
        {
          transform: [{ translateY }, { scale }],
        },
      ]}
    >
      <Text style={{ fontSize: place === 1 ? 28 : 20 }}>
        {crown ? '👑' : place}
      </Text>
      <Text style={{ fontWeight: '700' }}>{data.username}</Text>
      <Text style={{ color: '#FFD700' }}>{data.points}</Text>
    </Animated.View>
  );
}

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  container: {
    padding: 20,
    flex: 1,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
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
    marginBottom: 32,
  },
  podiumCard: {
    width: '30%',
    alignItems: 'center',
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#111',
  },
  jumpFloating: {
    position: 'absolute',
    bottom: 110,
    alignSelf: 'center',
    backgroundColor: '#5B7CFF',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
    zIndex: 20,
  },
  jumpText: {
    color: '#fff',
    fontWeight: '700',
  },
  row: {
    padding: 16,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
});
