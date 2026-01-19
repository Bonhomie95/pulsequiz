import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Flame, ShieldAlert } from 'lucide-react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

import { api } from '../src/api/api';
import { useTheme } from '../src/theme/useTheme';
import { useStreakStore } from '../src/store/useStreakStore';
import { useCoinStore } from '../src/store/useCoinStore';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Africa/Lagos';
const CALENDAR_RANGE = 7; // centered today (-3 to +3)

/* -------------------------------------------------------------------------- */
/*                                   SCREEN                                   */
/* -------------------------------------------------------------------------- */

export default function StreakScreen() {
  const theme = useTheme();
  const { streak, lastCheckIn, setFromBackend } = useStreakStore();
  const { addCoins } = useCoinStore();

  const [loading, setLoading] = useState(false);
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [missedYesterday, setMissedYesterday] = useState(false);
  const router = useRouter();

  /* ---------------- STREAK ANIMATION ---------------- */

  const scaleAnim = useRef(new Animated.Value(1)).current;

  const pulse = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.15,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  };

  /* ---------------- BACKEND SYNC ---------------- */

  const syncFromBackend = async () => {
    const res = await api.get('/home/summary');

    setFromBackend(res.data.streak, res.data.lastCheckIn);

    const now = dayjs().tz(TZ).startOf('day');
    const last = res.data.lastCheckIn
      ? dayjs(res.data.lastCheckIn).tz(TZ).startOf('day')
      : null;

    setCheckedInToday(
      !!lastCheckIn &&
        dayjs(lastCheckIn)
          .tz(TZ)
          .isSame(dayjs(res.data.lastCheckIn).tz(TZ), 'day')
    );

    // setCheckedInToday(!!last && last.isSame(now));
    setMissedYesterday(!!last && last.isBefore(now.subtract(1, 'day')));
  };

  useFocusEffect(
    useCallback(() => {
      syncFromBackend();
    }, [])
  );

  /* ---------------- CHECK-IN ---------------- */

  const checkIn = async () => {
    if (checkedInToday || loading) return;

    try {
      setLoading(true);

      const res = await api.get('/home/summary');

      setFromBackend(res.data.streak, res.data.lastCheckIn);

      setCheckedInToday(
        !!res.data.lastCheckIn &&
          dayjs(res.data.lastCheckIn).tz(TZ).isSame(dayjs().tz(TZ), 'day')
      );

      addCoins(res.data.coinsAdded);

      // setCheckedInToday(true);
      pulse();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Check-in failed');
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- STREAK DAYS ---------------- */

  const streakDays = useMemo(() => {
    if (!lastCheckIn || streak <= 0) return [];

    return Array.from({ length: streak }).map((_, i) =>
      dayjs(lastCheckIn).tz(TZ).subtract(i, 'day').format('YYYY-MM-DD')
    );
  }, [lastCheckIn, streak]);

  /* ---------------- CALENDAR ---------------- */

  const days = useMemo(() => {
    const today = lastCheckIn
      ? dayjs(lastCheckIn).tz(TZ).startOf('day')
      : dayjs().tz(TZ).startOf('day');

    return Array.from({ length: CALENDAR_RANGE }).map((_, i) => {
      const anchor = today;

      const date = anchor.subtract(3 - i, 'day');

      const key = date.format('YYYY-MM-DD');

      return {
        label: date.format('ddd'),
        date: date.format('DD'),
        isToday: date.isSame(today),
        isChecked: streakDays.includes(key),
        isMissed: date.isBefore(today) && !streakDays.includes(key),
      };
    });
  }, [streakDays]);

  /* -------------------------------------------------------------------------- */

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <TouchableOpacity
        onPress={() => router.replace('/')}
        style={[styles.backBtn, { backgroundColor: theme.colors.surface }]}
      >
        <ChevronLeft size={18} color={theme.colors.text} />
        <Text style={{ color: theme.colors.text, fontWeight: '600' }}>
          Home
        </Text>
      </TouchableOpacity>
      <View style={styles.container}>
        {/* HEADER */}
        <Animated.View
          style={[styles.header, { transform: [{ scale: scaleAnim }] }]}
        >
          <Flame size={30} color={theme.colors.primary} />
          <Text style={[styles.streakText, { color: theme.colors.text }]}>
            {streak <= 2 ? `${streak} Days Streak` : `${streak} Day Streak`}
          </Text>
        </Animated.View>

        {/* WARNING */}
        {missedYesterday && (
          <View
            style={[styles.warning, { backgroundColor: theme.colors.surface }]}
          >
            <ShieldAlert size={18} color={theme.colors.danger} />
            <Text style={{ color: theme.colors.danger }}>
              You missed yesterday — streak was reset
            </Text>
          </View>
        )}

        {/* CALENDAR */}
        <View style={styles.calendar}>
          {days.map((d, i) => (
            <View
              key={i}
              style={[
                styles.day,
                {
                  backgroundColor: d.isChecked
                    ? theme.colors.primary
                    : theme.colors.surface,
                  borderColor: d.isToday ? theme.colors.primary : 'transparent',
                  opacity: d.isMissed ? 0.35 : 1,
                },
              ]}
            >
              <Text
                style={{
                  color: d.isChecked ? '#fff' : theme.colors.text,
                  fontSize: 12,
                }}
              >
                {d.label}
              </Text>
              <Text
                style={{
                  color: d.isChecked ? '#fff' : theme.colors.text,
                  fontWeight: '800',
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
              fontWeight: '800',
            }}
          >
            {checkedInToday ? 'Checked in today' : 'Check in'}
          </Text>
        </TouchableOpacity>

        {/* STREAK FREEZE (FRONTEND READY) */}
        {/* <TouchableOpacity
          style={[styles.freeze, { backgroundColor: theme.colors.surface }]}
        >
          <Text style={{ color: theme.colors.text }}>
            Use Streak Freeze (Coming Soon)
          </Text>
        </TouchableOpacity> */}

        {/* TIMELINE */}
        <Text style={[styles.section, { color: theme.colors.text }]}>
          Streak Timeline
        </Text>

        {days
          .filter((d) => d.isChecked)
          .map((d) => (
            <View
              key={`${d.label}-${d.date}`}
              style={[
                styles.timelineItem,
                { backgroundColor: theme.colors.surface },
              ]}
            >
              <Text style={{ color: theme.colors.text }}>
                {dayjs().tz(TZ).date(Number(d.date)).format('dddd, MMM D')}
              </Text>
              <Text style={{ color: theme.colors.primary }}>Checked in</Text>
            </View>
          ))}
      </View>
    </SafeAreaView>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   STYLES                                   */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  container: {
    padding: 20,
    marginTop: 50,
  },
  header: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginBottom: 16,
  },
  streakText: {
    fontSize: 24,
    fontWeight: '900',
  },
  warning: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  calendar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  day: {
    width: 44,
    height: 62,
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
    marginBottom: 12,
  },
  freeze: {
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  section: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 12,
    marginTop:40,
  },
  timelineItem: {
    padding: 14,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  backBtn: {
    position: 'absolute',
    top: 44,
    left: 16,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
});
