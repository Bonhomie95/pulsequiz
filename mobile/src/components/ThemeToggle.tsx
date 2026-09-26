import * as Haptics from 'expo-haptics';
import { Monitor, Moon, Sun } from 'lucide-react-native';
import { StyleSheet, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';

import { useThemeStore } from '@/src/store/useThemeStore';
import { useTheme } from '@/src/theme/useTheme';

const NEXT = { system: 'dark', dark: 'light', light: 'system' } as const;
const LABEL = { system: 'system', dark: 'dark', light: 'light' } as const;

/**
 * Cycles system → dark → light. Used on the signed-out screens, where there is
 * no account to save the preference to — it is stored on the device only.
 */
export function ThemeToggle({ style }: { style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const { mode, setMode } = useThemeStore();
  const Icon = mode === 'system' ? Monitor : mode === 'dark' ? Moon : Sun;

  return (
    <TouchableOpacity
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setMode(NEXT[mode]);
      }}
      style={[styles.btn, { backgroundColor: theme.colors.surface }, style]}
      accessibilityRole="button"
      accessibilityLabel={`Theme: ${LABEL[mode]}. Tap to switch to ${LABEL[NEXT[mode]]}`}
      hitSlop={10}
    >
      <Icon size={18} color={theme.colors.muted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
