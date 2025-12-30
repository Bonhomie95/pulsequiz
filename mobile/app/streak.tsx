import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Flame } from 'lucide-react-native';
import dayjs from 'dayjs';

import { useTheme } from '../src/theme/useTheme';
import { api } from '../src/api/api';
import { useStreakStore } from '../src/store/useStreakStore';
import { useCoinStore } from '../src/store/useCoinStore';
import { useFocusEffect } from 'expo-router';

export default function StreakScreen() {
  const theme = useTheme();
  const { streak, lastCheckIn, hydrate } = useStreakStore();
  const { addCoins } = useCoinStore();

  const [loading, setLoading] = useState(false);
  const [checkedInToday, setCheckedInToday] = useState(false);

  useEffect(() => {
    hydrate();
  }, []);

  useEffect(() => {
    if (!lastCheckIn) return;
    setCheckedInToday(dayjs(lastCheckIn).isSame(dayjs(), 'day'));
  }, [lastCheckIn]);

  const refreshStreak = async () => {
    try {
      const res = await api.get('/home/summary');

      useStreakStore.getState().setStreak(res.data.streak);
      useStreakStore.getState().checkInToday();
    } catch {
      console.warn('Failed to refresh streak');
    }
  };

  useFocusEffect(
    useCallback(() => {
      refreshStreak();
    }, [])
  );

  /* ---------------- CALENDAR ---------------- */

  const days = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const date = dayjs().subtract(6 - i, 'day');
      const isChecked = lastCheckIn && dayjs(lastCheckIn).isSame(date, 'day');

      return {
        label: date.format('ddd'),
        date: date.format('DD'),
        active: isChecked,
        today: date.isSame(dayjs(), 'day'),
      };
    });
  }, [lastCheckIn]);

  /* ---------------- CHECK-IN ---------------- */

  const checkIn = async () => {
    if (checkedInToday || loading) return;

    try {
      setLoading(true);
      const res = await api.post('/streak/check-in');

      addCoins(res.data.coinsAdded);
      hydrate();
      setCheckedInToday(true);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Check-in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={styles.container}>
        {/* HEADER */}
        <View style={styles.header}>
          <Flame size={28} color={theme.colors.primary} />
          <Text style={[styles.streakText, { color: theme.colors.text }]}>
            {streak} Day Streak
          </Text>
        </View>

        {/* CALENDAR */}
        <View style={styles.calendar}>
          {days.map((d, i) => (
            <View
              key={i}
              style={[
                styles.day,
                {
                  backgroundColor: d.active
                    ? theme.colors.primary
                    : theme.colors.surface,
                  borderColor: d.today ? theme.colors.primary : 'transparent',
                },
              ]}
            >
              <Text
                style={{
                  color: d.active ? '#fff' : theme.colors.text,
                  fontSize: 12,
                }}
              >
                {d.label}
              </Text>
              <Text
                style={{
                  color: d.active ? '#fff' : theme.colors.text,
                  fontWeight: '700',
                }}
              >
                {d.date}
              </Text>
            </View>
          ))}
        </View>

        {/* CHECK-IN */}
        <TouchableOpacity
          disabled={checkedInToday}
          onPress={checkIn}
          style={[
            styles.checkIn,
            {
              backgroundColor: checkedInToday
                ? theme.colors.surface
                : theme.colors.primary,
            },
          ]}
        >
          <Text
            style={{
              color: checkedInToday ? theme.colors.muted : '#fff',
              fontWeight: '700',
            }}
          >
            {checkedInToday ? 'Checked in today' : 'Check in'}
          </Text>
        </TouchableOpacity>

        {/* MILESTONES */}
        <Text style={[styles.section, { color: theme.colors.text }]}>
          Milestones
        </Text>

        {[
          { day: 10, reward: 500 },
          { day: 20, reward: 1000 },
          { day: 30, reward: 2000 },
          { day: 50, reward: 5000 },
        ].map((m) => (
          <View
            key={m.day}
            style={[
              styles.milestone,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <Text style={{ color: theme.colors.text }}>{m.day} Days</Text>
            <Text style={{ color: theme.colors.coin }}>+{m.reward} coins</Text>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  container: { padding: 20 },
  header: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginBottom: 24,
  },
  streakText: {
    fontSize: 22,
    fontWeight: '800',
  },
  calendar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  day: {
    width: 44,
    height: 60,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  checkIn: {
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    marginTop: 32,
    marginBottom: 12,
    fontSize: 16,
    fontWeight: '700',
  },
  milestone: {
    padding: 16,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
});
