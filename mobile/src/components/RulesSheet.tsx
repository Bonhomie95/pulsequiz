import { useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useTheme } from '@/src/theme/useTheme';
import { LINKS } from '@/src/constants/links';
import { usePrizesAvailable } from '@/src/store/useAuthStore';

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
    section: 'Modes',
    items: [
      {
        title: 'Ranked',
        body: 'One wrong answer or a timeout ends the run. Only Ranked runs (and 1v1 matches) earn leaderboard points.',
      },
      {
        title: 'Practice, Daily Quiz and friend challenges',
        body: 'You answer all 10 questions and see an explanation where one exists. They earn league XP, not leaderboard points. The Daily Quiz is the same for everyone and can be played once a day.',
      },
      {
        title: 'Weekly leagues',
        body: 'Every correct answer, in any mode, earns league XP. Each week you race about 30 players at your level: the top of the group moves up a league, the bottom moves down, and the top 3 win coins.',
      },
    ],
  },
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
      {
        title: 'Help never buys ranking points',
        body: 'An answer helped by a hint or by extra time still keeps your run going, but it earns no leaderboard points and voids the perfect-run bonus. Prize rankings are decided by skill alone.',
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
        body: 'Only your first 20 ranked quizzes each day count toward the leaderboard. You can keep playing after that — you just stop earning ranking points, so nobody can grind their way to a prize.',
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
        title: 'Top players win USDT or USDC',
        body: 'How many places get paid is shown on the leaderboard from the start. The amounts stay hidden until the period ends, so the race stays about playing well rather than doing arithmetic. You choose USDT or USDC, and the network, in Settings.',
      },
      {
        title: 'When prizes are paid',
        body: 'Weekly boards close Monday 00:00 UTC and monthly boards on the 1st at 00:00 UTC. Payouts are processed automatically shortly after a board closes.',
      },
      {
        title: 'What you need to qualify',
        body: 'A USDT or USDC wallet address saved in Settings, an account at least 7 days old, at least 5 completed quizzes, and no open review on your account. Your wallet screen shows exactly which of these you still need.',
      },
      {
        title: 'Small prizes roll over',
        body: 'Prizes under $5 accumulate and are paid once the total passes the threshold, so a payout is never eaten by network fees.',
      },
      {
        title: 'Changing your wallet pauses payouts',
        body: 'For 72 hours after any change to your address, network or coin, so that if someone else ever got into your account you have time to notice and act. Crypto sent to an address or network you entered incorrectly cannot be recovered.',
      },
    ],
  },
  {
    section: 'Coins',
    items: [
      {
        title: 'Coins are not prize money',
        body: 'Coins buy hints, extra time, wagers and tournament entries. They have no cash value, cannot be withdrawn, and cannot be exchanged for USDT or USDC. Prizes come only from your leaderboard rank.',
      },
      {
        title: 'No purchase necessary',
        body: 'Playing, ranking and winning prizes never require buying anything. Purchased coins cannot earn leaderboard points.',
      },
      {
        title: 'Wagers stake both players',
        body: 'Both players put up the same amount of coins, and the winner takes the pot. If a match is drawn, or ends because someone disconnected before playing, both stakes are returned. Wagers are coins only — never real money.',
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
  {
    section: 'Official rules',
    items: [
      {
        title: 'Sponsor',
        body: `The prize competition is sponsored and run solely by PulseQuiz. ${
          Platform.OS === 'ios' ? 'Apple Inc.' : 'Google LLC'
        } is not a sponsor of, and is not involved in, this competition in any way.`,
      },
      {
        title: 'Eligibility',
        body: 'Open to players aged 18 or over (or the age of majority where they live, if higher). Void where prohibited or restricted by law — you are responsible for making sure taking part and receiving crypto prizes is legal where you live. One account per person.',
      },
      {
        title: 'Taxes and changes',
        body: 'Winners are responsible for any taxes on prizes. PulseQuiz may disqualify accounts that break these rules and may change prize pools for future periods; a period already in progress is never changed.',
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
  const prizes = usePrizesAvailable();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <Text style={[styles.title, { color: theme.colors.text }]}>{prizes ? 'Rules & prizes' : 'How it works'}</Text>
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
          {RULES.filter((g) => prizes || (g.section !== 'Prizes' && g.section !== 'Official rules')).map((group) => (
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
          {prizes && (
            <Text
              onPress={() => Linking.openURL(LINKS.RULES).catch(() => {})}
              accessibilityRole="link"
              style={{ color: theme.colors.primary, fontWeight: '700', textAlign: 'center', marginTop: 4 }}
            >
              Read the full official rules
            </Text>
          )}
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
