import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
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

import { api } from '../src/api/api';
import { useTheme } from '../src/theme/useTheme';
import { useStreakStore } from '../src/store/useStreakStore';
import { useCoinStore } from '../src/store/useCoinStore';

// Days are the device's local days: the API sends X-Timezone and the server
// computes the streak boundary in that zone (it used to be Lagos for everyone).
const CALENDAR_RANGE = 7; // centered today (-3 to +3)

/* -------------------------------------------------------------------------- */
/*                                   SCREEN                                   */
/* -------------------------------------------------------------------------- */

export default function StreakScreen() {
  const theme = useTheme();
  const { streak, lastCheckIn, setFromBackend } = useStreakStore();

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
    const res = await api.get('/home/summary').catch(() => null);
    if (!res) return;

    setFromBackend(res.data.streak, res.data.lastCheckIn);

    const today = dayjs().startOf('day');
    const lastCI = res.data.lastCheckIn
      ? dayjs(res.data.lastCheckIn).startOf('day')
      : null;
    setCheckedInToday(!!lastCI && lastCI.isSame(today));
    setMissedYesterday(!!lastCI && lastCI.isBefore(today.subtract(1, 'day')));
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

      // Actually check in — this used to only re-read /home/summary, so the
      // button did nothing when opened from a streak-warning notification.
      const res = await api.post('/streak/check-in');

      setFromBackend(res.data.streak, res.data.lastCheckIn);
      setCheckedInToday(true);
      setMissedYesterday(false);
      useCoinStore.getState().syncFromServer(res.data);
      pulse();
    } catch (e: any) {
      Alert.alert('Check-in failed', e?.response?.data?.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- STREAK DAYS ---------------- */

  const streakDays = useMemo(() => {
    if (!lastCheckIn || streak <= 0) return [];

    return Array.from({ length: streak }).map((_, i) =>
      dayjs(lastCheckIn).subtract(i, 'day').format('YYYY-MM-DD')
    );
  }, [lastCheckIn, streak]);

  /* ---------------- CALENDAR ---------------- */

  const days = useMemo(() => {
    // Always anchor the calendar to real (local) today, not lastCheckIn
    const today = dayjs().startOf('day');

    return Array.from({ length: CALENDAR_RANGE }).map((_, i) => {
      const date = today.subtract(3 - i, 'day');
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
        onPress={() => router.replace('/(tabs)/home')}
        style={[styles.backBtn, { backgroundColor: theme.colors.surface }]}
      
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}>
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
          disabled={checkedInToday || loading}
          accessibilityRole="button"
          accessibilityLabel={
            checkedInToday ? 'Already checked in today' : 'Check in for today'
          }
          accessibilityState={{ disabled: checkedInToday || loading, busy: loading }}
          onPress={checkIn}
          style={[
            styles.checkIn,
            {
              backgroundColor: checkedInToday
                ? theme.colors.surface
                : theme.colors.primary,
            },
          ]}
            hitSlop={8}>
          <Text
            style={{
              color: checkedInToday ? theme.colors.muted : '#fff',
              fontWeight: '800',
            }}
          >
            {checkedInToday ? 'Checked in today' : 'Check in'}
          </Text>
        </TouchableOpacity>


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
                {dayjs().date(Number(d.date)).format('dddd, MMM D')}
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
