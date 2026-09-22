import {
  Alert,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/src/theme/useTheme';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/src/api/api';
import { storage } from '@/src/utils/storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useQuizModeStore } from '@/src/store/useQuizModeStore';

export const CATEGORIES = [
  { id: 'General Knowledge', label: 'General Knowledge', icon: '🧠' },
  { id: 'History', label: 'History', icon: '📜' },
  { id: 'Math', label: 'Maths', icon: '➗' },
  { id: 'Physics', label: 'Physics', icon: '⚛️' },
  { id: 'Biology', label: 'Biology', icon: '🧬' },
  { id: 'Chemistry', label: 'Chemistry', icon: '🧪' },
  { id: 'Geography', label: 'Geography', icon: '🌍' },
  { id: 'Pop Culture', label: 'Pop Culture', icon: '🎬' },
  { id: 'Sports', label: 'Sports', icon: '⚽' },
  { id: 'Technology', label: 'Technology', icon: '💻' },
  { id: 'Food & Cooking', label: 'Food & Cooking', icon: '🍳' },
];

export default function QuizCategories() {
  const router = useRouter();
  const theme = useTheme();

  const [lastCategory, setLastCategory] = useState<string | null>(null);
  const mode = useQuizModeStore((s) => s.mode) ?? 'normal';
  const [creating, setCreating] = useState(false);

  const createDuel = async (category: string) => {
    if (creating) return;
    setCreating(true);
    try {
      const res: any = await api.post('/duels', { category });
      router.replace({ pathname: '/quiz/play', params: { mode: 'duel', duelCode: res.data.code } });
    } catch (e) {
      Alert.alert("Couldn't create the challenge", errorMessage(e, 'Please try again.'));
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    storage.getLastCategory().then(setLastCategory);
  }, []);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Back Home */}
      <TouchableOpacity
        onPress={() => router.replace('/quiz/mode')}
        style={[styles.backBtn, { backgroundColor: theme.colors.surface }]}
      
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}>
        <ChevronLeft size={18} color={theme.colors.text} />
        <Text style={{ color: theme.colors.text, fontWeight: '600' }}>
          Back
        </Text>
      </TouchableOpacity>

      {/* Hero Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Choose a Category
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.muted }]}>
          {mode === 'duel'
            ? 'Your friend will get the same 10 questions'
            : mode === 'relaxed'
              ? 'Practice — answer all 10, learn as you go'
              : 'Pick where you want to start your streak'}
        </Text>
      </View>

      {/* Categories */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <View style={styles.grid}>
        {CATEGORIES.map((cat) => {
          const isLast = lastCategory === cat.id;

          return (
            <TouchableOpacity
              key={cat.id}
              activeOpacity={0.9}
              onPress={() => {
                storage.setLastCategory(cat.id);
                if (mode === 'pvp') {
                  router.push(`/quiz/pvp/search?category=${cat.id}` as const);
                  return;
                }
                if (mode === 'duel') {
                  createDuel(cat.id);
                  return;
                }
                router.push({
                  pathname: '/quiz/play',
                  params: { category: cat.id, mode: mode === 'relaxed' ? 'relaxed' : 'classic' },
                });
              }}
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: isLast ? theme.colors.primary : 'transparent',
                },
              ]}
            
            accessibilityRole="button"
            accessibilityLabel={isLast ? `${cat.label}, last played` : cat.label}
            hitSlop={8}>
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
        </View>
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

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },

  card: {
    width: '47%',
    height: 170,
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
