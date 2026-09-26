import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api/api';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { useQuizModeStore } from '@/src/store/useQuizModeStore';
import { useTheme } from '@/src/theme/useTheme';

type DuelSummary = {
  code: string;
  category: string;
  expired: boolean;
  opponent: string | null;
  myStatus: 'playing' | 'done' | 'not_played';
  theirStatus: 'playing' | 'done' | 'waiting';
  myScore: number | null;
  theirScore: number | null;
};

const CODE_RE = /^[A-Z2-9]{6}$/;

function statusLine(d: DuelSummary) {
  if (d.myStatus === 'done' && d.theirStatus === 'done') {
    const a = d.myScore ?? 0;
    const b = d.theirScore ?? 0;
    return a > b ? `You won ${a}–${b}` : a < b ? `You lost ${a}–${b}` : `Level on score ${a}–${b}`;
  }
  if (d.myStatus !== 'done') return d.expired ? 'Expired' : 'Your turn';
  return d.expired ? 'Expired — nobody took it' : 'Waiting for your friend';
}

export default function DuelHub() {
  const theme = useTheme();
  const router = useRouter();
  const setMode = useQuizModeStore((s) => s.setMode);
  const [code, setCode] = useState('');
  const [duels, setDuels] = useState<DuelSummary[]>([]);

  useFocusEffect(
    useCallback(() => {
      api
        .get('/duels')
        .then((r: any) => setDuels(r.data.duels ?? []))
        .catch(() => {});
    }, []),
  );

  const valid = CODE_RE.test(code);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScreenHeader title="Challenge a Friend" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={[styles.card, { backgroundColor: theme.colors.primary }]}>
            <Text style={styles.cardTitle}>Start a challenge</Text>
            <Text style={styles.cardSub}>
              Play 10 questions, then send the link. Your friend gets the same questions and plays whenever
              they like — within 7 days.
            </Text>
            <TouchableOpacity
              onPress={() => {
                setMode('duel');
                router.push('/quiz/categories');
              }}
              style={styles.whiteBtn}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>Pick a category</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Got a code?</Text>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              placeholder="ABC234"
              placeholderTextColor={theme.colors.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              accessibilityLabel="Challenge code"
              style={[
                styles.input,
                { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.background },
              ]}
            />
            <TouchableOpacity
              disabled={!valid}
              onPress={() => router.push({ pathname: '/duel/[code]', params: { code } })}
              style={[styles.btn, { backgroundColor: theme.colors.primary, opacity: valid ? 1 : 0.4 }]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !valid }}
              hitSlop={8}
            >
              <Text style={{ color: '#fff', fontWeight: '900' }}>Open challenge</Text>
            </TouchableOpacity>
          </View>

          {duels.length > 0 && (
            <>
              <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 15 }}>Recent</Text>
              {duels.map((d) => (
                <TouchableOpacity
                  key={d.code}
                  onPress={() => router.push({ pathname: '/duel/[code]', params: { code: d.code } })}
                  style={[styles.row, { backgroundColor: theme.colors.surface }]}
                  accessibilityRole="button"
                  hitSlop={4}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontWeight: '800' }}>
                      <Text style={{ textTransform: 'capitalize' }}>{d.category}</Text>
                      {d.opponent ? ` vs ${d.opponent}` : ''}
                    </Text>
                    <Text style={{ color: theme.colors.muted, fontSize: 12, marginTop: 2 }}>{statusLine(d)}</Text>
                  </View>
                  <Text style={{ color: theme.colors.muted, fontWeight: '700', letterSpacing: 1 }}>{d.code}</Text>
                </TouchableOpacity>
              ))}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 18, gap: 10 },
  cardTitle: { color: '#fff', fontSize: 17, fontWeight: '900' },
  cardSub: { color: '#ffffffd9', fontSize: 13 },
  whiteBtn: { backgroundColor: '#fff', borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  btn: { borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 6,
    textAlign: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, gap: 10 },
});
