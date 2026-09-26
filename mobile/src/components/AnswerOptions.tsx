import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/src/theme/useTheme';

/**
 * The answer buttons, shared by every mode that asks a question.
 *
 * Solo and 1v1 had separate copies of this. They drifted: solo showed the
 * right answer in green and a wrong pick in red, 1v1 showed nothing at all, so
 * the same tap looked like it had done nothing depending on which screen you
 * were on. The two modes differ in how they talk to the server, not in what a
 * question looks like, so the rendering lives here once.
 *
 * Purely presentational: it owns no timers and no network. The caller says
 * what has been picked and what the server ruled, and this draws it.
 */
export type AnswerOptionsProps = {
  options: string[];
  /** What this player tapped, before any verdict. */
  picked: number | null;
  /** The right answer, once the server has said. Null hides all feedback. */
  correctIndex: number | null;
  /** Indexes removed by a hint, drawn faded and inert. */
  disabledIndexes?: number[];
  /** Blocks further taps — mid-submit, or the verdict is already in. */
  locked?: boolean;
  onPick: (index: number) => void;
};

export function AnswerOptions({
  options,
  picked,
  correctIndex,
  disabledIndexes = [],
  locked = false,
  onPick,
}: AnswerOptionsProps) {
  const theme = useTheme();
  const revealed = correctIndex !== null;

  return (
    <View style={styles.list}>
      {options.map((opt, i) => {
        const isDisabled = disabledIndexes.includes(i);
        const isCorrect = revealed && correctIndex === i;
        const isWrongPick = revealed && picked === i && !isCorrect;

        const background = isCorrect
          ? theme.colors.success
          : isWrongPick
            ? theme.colors.danger
            : theme.colors.surface;
        const border = isCorrect || isWrongPick ? background : theme.colors.border;
        const textColor = isCorrect || isWrongPick ? '#fff' : theme.colors.text;

        return (
          <Pressable
            key={i}
            accessibilityRole="button"
            accessibilityLabel={`Answer ${i + 1}: ${opt}`}
            accessibilityState={{
              disabled: locked || isDisabled || picked !== null,
              selected: picked === i,
            }}
            onPress={() => {
              if (locked || isDisabled || picked !== null) return;
              onPick(i);
            }}
            style={({ pressed }) => [
              styles.option,
              {
                backgroundColor: background,
                borderColor: border,
                opacity: isDisabled ? 0.35 : locked && !revealed ? 0.65 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
            hitSlop={8}
          >
            <Text style={[styles.label, { color: textColor }]}>{opt}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  option: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  label: { fontWeight: '700', fontSize: 15 },
});
