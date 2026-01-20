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
import { ChevronLeft } from 'lucide-react-native';
import { useQuizModeStore } from '@/src/store/useQuizModeStore';

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
  const mode = useQuizModeStore((s) => s.mode);

  useEffect(() => {
    storage.getLastCategory().then(setLastCategory);
  }, []);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Back Home */}
      <TouchableOpacity
        onPress={() => router.replace('/')}
        style={[styles.backBtn, { backgroundColor: theme.colors.surface }]}
      >
        <ChevronLeft size={18} color={theme.colors.text} />
        <Text style={{ color: theme.colors.text, fontWeight: '600' }}>
          Home
        </Text>
      </TouchableOpacity>

      {/* Hero Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Choose a Category
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.muted }]}>
          Pick where you want to start your streak
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
                if (mode === 'normal') {
                  router.push(`/quiz/play?category=${cat.id}`);
                }
                if (mode === 'pvp') {
                  router.push(`/quiz/pvp/search?category=${cat.id}` as any);
                }

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
              {/* Last Played */}
              {isLast && (
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: theme.colors.primary },
                  ]}
                >
                  <Text style={styles.badgeText}>LAST PLAYED</Text>
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
                Tap to start →
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
  },

  /* Back */
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

  /* Header */
  header: {
    marginTop: 92,
    paddingHorizontal: 20,
    marginBottom: 24,
  },

  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
  },

  subtitle: {
    marginTop: 6,
    fontSize: 13,
  },

  /* Scroll */
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  card: {
    width: 150,
    height: 190,
    borderRadius: 24,
    marginRight: 18,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,

    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 7,
  },

  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },

  icon: {
    fontSize: 26,
  },

  label: {
    fontSize: 16,
    fontWeight: '700',
  },

  hint: {
    marginTop: 6,
    fontSize: 11,
  },

  badge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },

  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
});
