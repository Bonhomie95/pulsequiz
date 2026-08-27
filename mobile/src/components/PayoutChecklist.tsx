import { StyleSheet, Text, View } from 'react-native';
import { Check, AlertCircle, Clock } from 'lucide-react-native';
import { useTheme } from '@/src/theme/useTheme';

/**
 * The same eligibility rules the payout job applies, shown to the player.
 *
 * Previously a ranked player could be skipped for `account_too_new`,
 * `insufficient_sessions` or `no_usdt_address` and never find out why — the
 * reason was computed server-side and discarded.
 */
export type Eligibility = {
  eligible: boolean;
  reason?: string;
  message?: string;
};

const REASON_ICON: Record<string, 'blocked' | 'waiting'> = {
  address_recently_changed: 'waiting',
  account_too_new: 'waiting',
  flagged_for_review: 'waiting',
  insufficient_sessions: 'blocked',
  no_usdt_address: 'blocked',
  withdrawal_disabled: 'blocked',
  banned: 'blocked',
  deleted: 'blocked',
};

export function PayoutChecklist({ eligibility }: { eligibility: Eligibility | null }) {
  const theme = useTheme();

  if (!eligibility) return null;

  if (eligibility.eligible) {
    return (
      <View
        style={[
          styles.card,
          { backgroundColor: theme.colors.success + '15', borderColor: theme.colors.success + '44' },
        ]}
        accessible
        accessibilityLabel="You are eligible to receive prizes"
      >
        <Check size={18} color={theme.colors.success} strokeWidth={3} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.colors.success }]}>
            Ready to receive prizes
          </Text>
          <Text style={[styles.body, { color: theme.colors.muted }]}>
            If you finish in a paying rank, your USDT is sent automatically.
          </Text>
        </View>
      </View>
    );
  }

  const kind = REASON_ICON[eligibility.reason ?? ''] ?? 'blocked';
  const tint = kind === 'waiting' ? theme.colors.warning : theme.colors.danger;

  return (
    <View
      style={[styles.card, { backgroundColor: tint + '15', borderColor: tint + '44' }]}
      accessible
      accessibilityLabel={`Prize payouts blocked: ${eligibility.message}`}
    >
      {kind === 'waiting' ? (
        <Clock size={18} color={tint} />
      ) : (
        <AlertCircle size={18} color={tint} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: tint }]}>
          {kind === 'waiting' ? 'Almost there' : 'Action needed'}
        </Text>
        <Text style={[styles.body, { color: theme.colors.text }]}>
          {eligibility.message ?? 'You are not currently eligible for prize payouts.'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 14,
  },
  title: { fontSize: 14, fontWeight: '800', marginBottom: 3 },
  body: { fontSize: 13, lineHeight: 19 },
});
