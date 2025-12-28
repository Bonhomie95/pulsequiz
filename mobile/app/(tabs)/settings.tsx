import { useAuthStore } from '@/src/store/useAuthStore';
import { useThemeStore } from '@/src/store/useThemeStore';
import { useTheme } from '@/src/theme/useTheme';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SettingsScreen() {
  const theme = useTheme();
  const { mode, setMode } = useThemeStore();
  const { logout } = useAuthStore();

  return (
    <SafeAreaView
      edges={['top']}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <View style={styles.container}>
        <Section title="Appearance">
          <Option
            label="Theme"
            value={mode}
            onPress={() => {
              if (mode === 'system') setMode('dark');
              else if (mode === 'dark') setMode('light');
              else setMode('system');
            }}
          />
        </Section>

        <Section title="Wallet">
          <Option label="USDT Wallet" value="Not set" />
          <Option label="Withdrawal PIN" value="Not set" />
        </Section>

        <Section title="Account">
          <TouchableOpacity
            onPress={logout}
            style={[styles.logout, { backgroundColor: theme.colors.danger }]}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Logout</Text>
          </TouchableOpacity>
        </Section>
      </View>
    </SafeAreaView>
  );
}

function Section({ title, children }: any) {
  const theme = useTheme();
  return (
    <View style={{ marginBottom: 28 }}>
      <Text
        style={{
          color: theme.colors.muted,
          marginBottom: 8,
          fontSize: 13,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function Option({
  label,
  value,
  onPress,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.option, { backgroundColor: theme.colors.surface }]}
    >
      <Text style={{ color: theme.colors.text }}>{label}</Text>
      {value && <Text style={{ color: theme.colors.muted }}>{value}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  option: {
    padding: 16,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  logout: {
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
});
