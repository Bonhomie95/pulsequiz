import { useQuizModeStore, type QuizMode } from '@/src/store/useQuizModeStore';
import { useRouter } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/src/theme/useTheme';
import { Target, Swords, ChevronLeft, BookOpen, Users } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

type Option = {
  mode: QuizMode;
  title: string;
  sub: string;
  reward: string;
  Icon: LucideIcon;
  featured?: boolean;
};

const OPTIONS: Option[] = [
  {
    mode: 'normal',
    title: 'Ranked',
    sub: 'One wrong answer ends the run • Counts for the leaderboard',
    reward: '🎯 1 point per correct answer, +10 for a perfect run',
    Icon: Target,
  },
  {
    mode: 'relaxed',
    title: 'Practice',
    sub: 'Answer all 10 • See why each answer is right • No pressure',
    reward: '📘 Earns league XP, not leaderboard points',
    Icon: BookOpen,
  },
  {
    mode: 'pvp',
    title: '1v1 Live',
    sub: 'Real opponent • Same questions • Speed matters',
    reward: '⚔️ Win points, coins and rating',
    Icon: Swords,
    featured: true,
  },
  {
    mode: 'duel',
    title: 'Challenge a Friend',
    sub: 'Play 10 questions, send the code, compare scores',
    reward: '🤝 No need to be online at the same time',
    Icon: Users,
  },
];

export default function QuizModeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const setMode = useQuizModeStore((s) => s.setMode);

  const choose = (mode: QuizMode) => {
    setMode(mode);
    router.push('/quiz/categories' as const);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <TouchableOpacity
        onPress={() => router.replace('/(tabs)/home')}
        style={[styles.backBtn, { backgroundColor: theme.colors.surface }]}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
      >
        <ChevronLeft size={18} color={theme.colors.text} />
        <Text style={{ color: theme.colors.text, fontWeight: '600' }}>Home</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={{ paddingTop: 60, paddingHorizontal: 20, paddingBottom: 32 }}>
        <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.text }}>
          Choose Your Mode
        </Text>
        <Text style={{ color: theme.colors.muted, marginTop: 6, fontSize: 14 }}>
          Every mode earns XP for your weekly league
        </Text>

        <View style={{ marginTop: 24, gap: 14 }}>
          {OPTIONS.map(({ mode, title, sub, reward, Icon, featured }) => {
            const fg = featured ? '#fff' : theme.colors.text;
            const muted = featured ? '#ffffffcc' : theme.colors.muted;
            return (
              <TouchableOpacity
                key={mode}
                onPress={() => choose(mode)}
                activeOpacity={0.85}
                style={[
                  styles.card,
                  featured
                    ? { backgroundColor: theme.colors.primary }
                    : { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${title}. ${sub}`}
                hitSlop={8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <View
                    style={[
                      styles.icon,
                      { backgroundColor: featured ? '#ffffff25' : theme.colors.primary + '20' },
                    ]}
                  >
                    <Icon size={24} color={featured ? '#fff' : theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 17, fontWeight: '900', color: fg }}>{title}</Text>
                    <Text style={{ color: muted, fontSize: 13, marginTop: 3 }}>{sub}</Text>
                  </View>
                </View>
                <Text
                  style={{
                    marginTop: 12,
                    color: featured ? '#fff' : theme.colors.primary,
                    fontWeight: '700',
                    fontSize: 13,
                  }}
                >
                  {reward}
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
  card: { borderRadius: 22, padding: 18 },
  icon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
