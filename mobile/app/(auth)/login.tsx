import { useRouter } from 'expo-router';
import { Monitor, Moon, Sun } from 'lucide-react-native';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../../src/store/useThemeStore';
import { useTheme } from '../../src/theme/useTheme';

export default function LoginScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { mode, setMode } = useThemeStore();

  const cycleTheme = () => {
    if (mode === 'system') setMode('dark');
    else if (mode === 'dark') setMode('light');
    else setMode('system');
  };

  const ThemeIcon = mode === 'system' ? Monitor : mode === 'dark' ? Moon : Sun;

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        {/* Theme Toggle */}
        <TouchableOpacity style={styles.themeToggle} onPress={cycleTheme}>
          <ThemeIcon size={22} color={theme.colors.text} />
        </TouchableOpacity>

        {/* Logo */}
        <View style={styles.center}>
          <Text style={[styles.logo, { color: theme.colors.text }]}>
            Pulse Quiz
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.muted }]}>
            Think fast. Win smarter.
          </Text>
        </View>

        {/* Auth Buttons */}
        <View style={styles.actions}>
          <AuthButton
            label="Continue with Google"
            onPress={() => {
              // Google auth later
            }}
          />
          <AuthButton
            label="Continue with Facebook"
            onPress={() => {
              // Facebook auth later
            }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function AuthButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.authBtn} onPress={onPress}>
      <Text style={styles.authText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  themeToggle: {
    position: 'absolute',
    top: 60,
    right: 24,
    zIndex: 10,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    fontSize: 42,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
  },
  actions: {
    paddingBottom: 40,
    gap: 16,
  },
  authBtn: {
    height: 56,
    borderRadius: 28,
    backgroundColor: '#5B7CFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  authText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
