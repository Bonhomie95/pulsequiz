import { useQuizModeStore } from '@/src/store/useQuizModeStore';
import { useRouter } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/src/theme/useTheme';
import { Target, Swords, ChevronLeft } from 'lucide-react-native';

export default function QuizModeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const setMode = useQuizModeStore((s) => s.setMode);

  const goNormal = () => {
    setMode('normal');
    router.push('/quiz/categories' as const);
  };

  const goPvP = () => {
    setMode('pvp');
    router.push('/quiz/categories' as const);
  };

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

      <View style={{ paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20, flex: 1 }}>
        {/* HEADER */}
        <Text
          style={{
            fontSize: 26,
            fontWeight: '900',
            color: theme.colors.text,
          }}
        >
          Choose Your Mode
        </Text>

        <Text
          style={{
            color: theme.colors.muted,
            marginTop: 6,
            fontSize: 14,
          }}
        >
          Play solo or challenge real players
        </Text>

        {/* MODES */}
        <View style={{ marginTop: 28, gap: 18 }}>
          {/* NORMAL MODE */}
          <TouchableOpacity
            onPress={goNormal}
            activeOpacity={0.85}
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: 22,
              padding: 20,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  backgroundColor: theme.colors.primary + '20',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Target size={26} color={theme.colors.primary} />
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: '800',
                    color: theme.colors.text,
                  }}
                >
                  Normal Quiz
                </Text>

                <Text
                  style={{
                    color: theme.colors.muted,
                    fontSize: 13,
                    marginTop: 4,
                  }}
                >
                  Solo play • Improve accuracy • Earn points
                </Text>
              </View>
            </View>

            <View style={{ marginTop: 14 }}>
              <Text
                style={{
                  color: theme.colors.primary,
                  fontWeight: '700',
                  fontSize: 13,
                }}
              >
                🎯 Reward: +20 points
              </Text>
            </View>
          </TouchableOpacity>

          {/* PVP MODE */}
          <TouchableOpacity
            onPress={goPvP}
            activeOpacity={0.85}
            style={{
              backgroundColor: theme.colors.primary,
              borderRadius: 22,
              padding: 20,
            }}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  backgroundColor: '#ffffff25',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Swords size={26} color="#fff" />
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: '900',
                    color: '#fff',
                  }}
                >
                  1v1 Challenge
                </Text>

                <Text
                  style={{
                    color: '#ffffffcc',
                    fontSize: 13,
                    marginTop: 4,
                  }}
                >
                  Real opponent • Same questions • Speed matters
                </Text>
              </View>
            </View>

            <View style={{ marginTop: 14 }}>
              <Text
                style={{
                  color: '#fff',
                  fontWeight: '800',
                  fontSize: 13,
                }}
              >
                ⚔️ Winner: +50 points & +50 coins
              </Text>

              <Text
                style={{
                  color: '#ffffffcc',
                  fontSize: 12,
                  marginTop: 2,
                }}
              >
                Loser still earns coins
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* FOOTER NOTE */}
        <View style={{ marginTop: 'auto', paddingTop: 24 }}>
          <Text
            style={{
              textAlign: 'center',
              color: theme.colors.muted,
              fontSize: 12,
            }}
          >
            Rankings update weekly & monthly • Fair unseen questions
          </Text>
        </View>
      </View>
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
});
