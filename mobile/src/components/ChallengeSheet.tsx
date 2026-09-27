import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { CATEGORIES } from '@/app/quiz/categories';
import { COIN_NAME } from '@/src/constants/currency';
import { useCoinStore } from '@/src/store/useCoinStore';
import { useTheme } from '@/src/theme/useTheme';

/**
 * Pick the terms before a challenge goes out.
 *
 * Sending one with a fixed category and no stake made the feature useless for
 * the thing people actually argue about — what you are playing and what is on
 * it. The same sheet backs the counter-offer, so "yes, but make it Sports for
 * 50" is one screen rather than a decline and a fresh invite from the other
 * side.
 */
export const WAGER_OPTIONS = [0, 10, 25, 50, 100, 200, 500];

export function ChallengeSheet({
  visible,
  opponentName,
  opponentStatus,
  mode,
  initialCategory,
  initialWager,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  opponentName: string;
  /**
   * Whether they can actually take it right now. Worth knowing before you
   * spend the thought on a category and a stake — and the home carousel is
   * the one place you can open this without having seen their status first.
   */
  opponentStatus?: 'in_game' | 'online' | 'away' | 'offline' | null;
  /** 'send' for a new challenge, 'counter' when answering one. */
  mode: 'send' | 'counter';
  initialCategory?: string | null;
  initialWager?: number;
  onCancel: () => void;
  onConfirm: (category: string, wager: number) => void;
}) {
  const theme = useTheme();
  const coins = useCoinStore((s) => s.coins);

  const [category, setCategory] = useState(
    initialCategory || CATEGORIES[0].id,
  );
  const [wager, setWager] = useState(initialWager ?? 0);

  const tooRich = wager > coins;

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
          ]}
        >
          <Text style={[styles.title, { color: theme.colors.text }]}>
            {mode === 'counter' ? `Counter ${opponentName}` : `Challenge ${opponentName}`}
          </Text>
          <Text style={[styles.sub, { color: theme.colors.muted }]}>
            {mode === 'counter'
              ? 'Change the terms and send it back.'
              : 'They can accept, decline, or send different terms back.'}
          </Text>

          {mode === 'send' && opponentStatus ? (
            <View
              style={[
                styles.status,
                {
                  borderColor:
                    opponentStatus === 'in_game'
                      ? '#FF6B00'
                      : opponentStatus === 'online'
                        ? '#22C55E'
                        : theme.colors.border,
                },
              ]}
            >
              <Text
                style={{
                  fontWeight: '800',
                  fontSize: 12,
                  color:
                    opponentStatus === 'in_game'
                      ? '#FF6B00'
                      : opponentStatus === 'online'
                        ? '#22C55E'
                        : theme.colors.muted,
                }}
              >
                {opponentStatus === 'in_game'
                  ? '🎮 In a game — they may not see this yet'
                  : opponentStatus === 'online'
                    ? '🟢 Online now'
                    : '⚪️ Not online — they will get a notification'}
              </Text>
            </View>
          ) : null}

          <Text style={[styles.label, { color: theme.colors.muted }]}>CATEGORY</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
            <View style={styles.chipRow}>
              {CATEGORIES.map((c) => {
                const on = c.id === category;
                return (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => setCategory(c.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={c.label}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: on ? theme.colors.primary : theme.colors.surface,
                        borderColor: on ? theme.colors.primary : theme.colors.border,
                      },
                    ]}
                  >
                    <Text style={{ color: on ? '#fff' : theme.colors.text, fontWeight: '800' }}>
                      {c.icon} {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <Text style={[styles.label, { color: theme.colors.muted }]}>
            STAKE · you have {coins} {COIN_NAME.plural}
          </Text>
          <View style={styles.chipRow}>
            {WAGER_OPTIONS.map((w) => {
              const on = w === wager;
              const cannot = w > coins;
              return (
                <TouchableOpacity
                  key={w}
                  disabled={cannot}
                  onPress={() => setWager(w)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on, disabled: cannot }}
                  accessibilityLabel={w === 0 ? 'Friendly, no stake' : `${w} ${COIN_NAME.plural}`}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: on ? theme.colors.primary : theme.colors.surface,
                      borderColor: on ? theme.colors.primary : theme.colors.border,
                      opacity: cannot ? 0.4 : 1,
                    },
                  ]}
                >
                  <Text style={{ color: on ? '#fff' : theme.colors.text, fontWeight: '800' }}>
                    {w === 0 ? 'Friendly' : w}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            disabled={tooRich}
            onPress={() => onConfirm(category, wager)}
            accessibilityRole="button"
            accessibilityLabel={mode === 'counter' ? 'Send counter-offer' : 'Send challenge'}
            style={[
              styles.send,
              { backgroundColor: theme.colors.primary, opacity: tooRich ? 0.5 : 1 },
            ]}
          >
            <Text style={styles.sendLabel}>
              {mode === 'counter' ? 'Send it back' : 'Send challenge'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={{ paddingVertical: 12, alignItems: 'center' }}
            hitSlop={8}
          >
            <Text style={{ color: theme.colors.muted, fontWeight: '700' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
  },
  title: { fontSize: 20, fontWeight: '900' },
  sub: { fontSize: 13, marginTop: 4, lineHeight: 19 },
  label: { fontSize: 11, fontWeight: '900', letterSpacing: 1, marginTop: 20, marginBottom: 10 },
  status: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1 },
  send: { marginTop: 22, paddingVertical: 15, borderRadius: 16, alignItems: 'center' },
  sendLabel: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
