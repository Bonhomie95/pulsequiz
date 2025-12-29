import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/src/theme/useTheme';
import { useEffect, useState } from 'react';
import { storage } from '@/src/utils/storage';
import { SafeAreaView } from 'react-native-safe-area-context';

const CATEGORIES = [
  { id: 'history', label: 'History', icon: '📜' },
  { id: 'math', label: 'Maths', icon: '➗' },
  { id: 'physics', label: 'Physics', icon: '⚛️' },
  { id: 'biology', label: 'Biology', icon: '🧬' },
  { id: 'chemistry', label: 'Chemistry', icon: '🧪' },
  { id: 'geography', label: 'Geography', icon: '🌍' },
];

export default function QuizCategories() {
  const router = useRouter();
  const theme = useTheme();

  const [lastCategory, setLastCategory] = useState<string | null>(null);

  useEffect(() => {
    storage.getLastCategory().then(setLastCategory);
  }, []);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Choose a Category
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.muted }]}>
          Pick where you want to start
        </Text>
      </View>

      {/* Categories */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {CATEGORIES.map((cat) => {
          const isLast = lastCategory === cat.id;

          return (
            <TouchableOpacity
              key={cat.id}
              activeOpacity={0.9}
              onPress={() => {
                storage.setLastCategory(cat.id);
                router.push({
                  pathname: '/quiz/play',
                  params: { category: cat.id },
                });
              }}
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: isLast ? theme.colors.primary : 'transparent',
                },
              ]}
            >
              {/* Last Played Badge */}
              {isLast && (
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: theme.colors.primary },
                  ]}
                >
                  <Text style={styles.badgeText}>LAST</Text>
                </View>
              )}

              {/* Icon */}
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: theme.colors.primary },
                ]}
              >
                <Text style={styles.icon}>{cat.icon}</Text>
              </View>

              {/* Label */}
              <Text style={[styles.label, { color: theme.colors.text }]}>
                {cat.label}
              </Text>

              {/* Hint */}
              <Text style={[styles.hint, { color: theme.colors.muted }]}>
                Tap to play →
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 24,
  },

  header: {
    paddingHorizontal: 20,
    marginBottom: 18,
  },

  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
  },

  subtitle: {
    marginTop: 4,
    fontSize: 13,
  },

  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },

  card: {
    width: 140,
    height: 170,
    borderRadius: 22,
    marginRight: 16,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,

    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 6,
  },

  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },

  icon: {
    fontSize: 24,
  },

  label: {
    fontSize: 15,
    fontWeight: '700',
  },

  hint: {
    marginTop: 4,
    fontSize: 11,
  },

  badge: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },

  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
});
