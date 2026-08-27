import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Flag, X } from 'lucide-react-native';
import { api, errorMessage } from '@/src/api/api';
import { useTheme } from '@/src/theme/useTheme';

/**
 * "This question is wrong."
 *
 * A wrong answer key costs the player their whole run — one wrong answer ends
 * a quiz — and there was no way to tell anyone. Reports accumulate on the
 * question, and past a threshold the server pulls it from rotation pending
 * review.
 */
const REASONS: { key: string; label: string }[] = [
  { key: 'wrong_answer', label: 'The marked answer is wrong' },
  { key: 'unclear', label: "The question is unclear or has more than one right answer" },
  { key: 'typo', label: 'There is a typo or formatting problem' },
  { key: 'outdated', label: 'The answer is out of date' },
  { key: 'offensive', label: 'The content is offensive' },
  { key: 'other', label: 'Something else' },
];

export function ReportQuestionButton({
  questionId,
  compact,
}: {
  questionId: string;
  compact?: boolean;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (reason: string) => {
    setSending(true);
    setError(null);
    try {
      await api.post('/reports/question', { questionId, reason });
      setDone(true);
      setTimeout(() => {
        setOpen(false);
        setDone(false);
      }, 1400);
    } catch (e) {
      setError(errorMessage(e, "Couldn't send that report."));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Report a problem with this question"
        hitSlop={12}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingVertical: 6,
          paddingHorizontal: compact ? 6 : 10,
          opacity: 0.65,
        }}
      >
        <Flag size={13} color={theme.colors.muted} />
        {!compact && (
          <Text style={{ color: theme.colors.muted, fontSize: 12, fontWeight: '600' }}>
            Report
          </Text>
        )}
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.head}>
              <Text style={[styles.title, { color: theme.colors.text }]}>
                Report this question
              </Text>
              <TouchableOpacity
                onPress={() => setOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={12}
              >
                <X size={18} color={theme.colors.muted} />
              </TouchableOpacity>
            </View>

            {done ? (
              <Text
                style={{
                  color: theme.colors.success,
                  fontWeight: '700',
                  paddingVertical: 20,
                  textAlign: 'center',
                }}
              >
                Thanks &mdash; we&apos;ll review it.
              </Text>
            ) : (
              <>
                {REASONS.map((r) => (
                  <TouchableOpacity
                    key={r.key}
                    disabled={sending}
                    onPress={() => submit(r.key)}
                    accessibilityRole="button"
                    accessibilityLabel={r.label}
                    style={[styles.reason, { borderColor: theme.colors.border }]}
                  >
                    <Text style={{ color: theme.colors.text, fontSize: 14 }}>
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                ))}

                {sending && (
                  <ActivityIndicator
                    style={{ marginTop: 10 }}
                    color={theme.colors.primary}
                  />
                )}
                {error && (
                  <Text
                    style={{
                      color: theme.colors.danger,
                      fontSize: 13,
                      marginTop: 10,
                      textAlign: 'center',
                    }}
                  >
                    {error}
                  </Text>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 34,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: { fontSize: 17, fontWeight: '800' },
  reason: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
    minHeight: 48,
    justifyContent: 'center',
  },
});
