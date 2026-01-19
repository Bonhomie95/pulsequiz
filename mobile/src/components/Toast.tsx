import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/src/theme/useTheme';

type ToastProps = {
  visible: boolean;
  message: string;
  type?: 'success' | 'error';
  onHide: () => void;
};

export function Toast({
  visible,
  message,
  type = 'success',
  onHide,
}: ToastProps) {
  const theme = useTheme();

  useEffect(() => {
    if (!visible) return;

    const t = setTimeout(onHide, 2500);
    return () => clearTimeout(t);
  }, [visible]);

  if (!visible) return null;

  const bg = type === 'success' ? theme.colors.surface : theme.colors.danger;

  const accent = type === 'success' ? '#22c55e' : '#ef4444';

  return (
    <View style={[styles.wrap]}>
      <View
        style={[
          styles.toast,
          {
            backgroundColor: bg,
            borderLeftColor: accent,
          },
        ]}
      >
        <Text style={{ color: theme.colors.text, fontWeight: '700' }}>
          {message}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 999,
  },
  toast: {
    width: '100%',
    padding: 16,
    borderRadius: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
});
