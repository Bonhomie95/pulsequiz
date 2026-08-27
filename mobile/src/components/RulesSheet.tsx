import { useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useTheme } from '@/src/theme/useTheme';

/**
 * How the game actually works.
 *
 * Several mechanics have real consequences and were never explained anywhere:
 * one wrong answer ends the whole run, the daily cap silently zeroes
 * leaderboard points past a threshold, and prize amounts are deliberately
 * hidden until a period closes. Surprising a player with any of those reads as
 * the game cheating them.
 */
type Rule = { title: string; body: string };

const RULES: { section: string; items: Rule[] }[] = [
  {
    section: 'Playing',
    items: [
      {
        title: 'One wrong answer ends the run',
        body: 'Each quiz is a streak of 10 questions, getting harder as you go. A wrong answer — or running out of time — ends that run immediately. You keep the points you earned up to that question.',
      },
      {
        title: '15 seconds per question',
        body: 'The timer is enforced by the server, so a slow connection never costs you the answer you already sent. You can buy 10 extra seconds once per question.',
      },
      {
        title: 'Hints cost more each time',
        body: 'Up to 3 hints per quiz, one per question. Each removes a wrong option. They cost 10, then 20, then 50 coins.',
      },
    ],
  },
  {
    section: 'Points and the leaderboard',
    items: [
      {
        title: 'One point per correct answer',
        body: 'Answer all 10 correctly and you get a 10-point perfect-run bonus on top.',
      },
      {
        title: 'A daily cap keeps it fair',
        body: 'Only your first 20 quizzes each day count toward the leaderboard. You can keep playing after that — you just stop earning ranking points, so nobody can grind their way to a prize.',
      },
      {
        title: 'Weekly and monthly boards reset',
        body: 'Weekly resets Monday 00:00 UTC, monthly on the 1st. The all-time board never resets.',
      },
    ],
  },
  {
    section: 'Prizes',
    items: [
      {
        title: 'Top players win USDT',
        body: 'How many places get paid is shown on the leaderboard from the start. The amounts stay hidden until the period ends, so the race stays about playing well rather than doing arithmetic.',
      },
      {
        title: 'What you need to qualify',
        body: 'A USDT wallet address saved in Settings, an account at least 7 days old, at least 5 completed quizzes, and no open review on your account. Your wallet screen shows exactly which of these you still need.',
      },
      {
        title: 'Small prizes roll over',
        body: 'Prizes under $5 accumulate and are paid once the total passes the threshold, so a payout is never eaten by network fees.',
      },
      {
        title: 'Changing your wallet address pauses payouts',
        body: 'For 72 hours after any change, so that if someone else ever got into your account you have time to notice and act.',
      },
    ],
  },
  {
    section: 'Coins',
    items: [
      {
        title: 'Coins are not prize money',
        body: 'Coins buy hints, extra time, wagers and tournament entries. USDT prizes come from your leaderboard rank, not your coin balance.',
      },
      {
        title: 'Wagers stake both players',
        body: 'Both players put up the same amount, and the winner takes the pot. If a match is drawn, or ends because someone disconnected before playing, both stakes are returned.',
      },
    ],
  },
  {
    section: 'Fair play',
    items: [
      {
        title: 'Answers are checked on the server',
        body: 'The app never receives the correct answer before you pick, and timing is measured server-side.',
      },
      {
        title: 'Suspicious accounts are reviewed',
        body: 'Unusual accuracy or volume flags an account for review, which pauses prize payouts until a human has looked. Cheating gets an account banned and forfeits any prize.',
      },
    ],
  },
];

export function RulesSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <Text style={[styles.title, { color: theme.colors.text }]}>How it works</Text>
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
            style={[styles.closeBtn, { backgroundColor: theme.colors.surface }]}
          >
            <X size={18} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
          {RULES.map((group) => (
            <View key={group.section} style={{ marginBottom: 26 }}>
              <Text style={[styles.section, { color: theme.colors.primary }]}>
                {group.section.toUpperCase()}
              </Text>
              {group.items.map((rule) => (
                <View
                  key={rule.title}
                  style={[styles.card, { backgroundColor: theme.colors.surface }]}
                >
                  <Text style={[styles.ruleTitle, { color: theme.colors.text }]}>
                    {rule.title}
                  </Text>
                  <Text style={[styles.ruleBody, { color: theme.colors.muted }]}>
                    {rule.body}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Convenience hook so a screen can drop in a "How it works" entry point. */
export function useRulesSheet() {
  const [visible, setVisible] = useState(false);
  return {
    visible,
    open: () => setVisible(true),
    close: () => setVisible(false),
    Sheet: () => <RulesSheet visible={visible} onClose={() => setVisible(false)} />,
  };
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  title: { fontSize: 22, fontWeight: '900' },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  card: { borderRadius: 14, padding: 16, marginBottom: 10 },
  ruleTitle: { fontSize: 15, fontWeight: '800', marginBottom: 6 },
  ruleBody: { fontSize: 14, lineHeight: 21 },
});
