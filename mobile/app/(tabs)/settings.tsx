import { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api/api';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useThemeStore } from '@/src/store/useThemeStore';
import { useTheme } from '@/src/theme/useTheme';
import { useRouter } from 'expo-router';

const USDT_TYPES = ['TRC20', 'ERC20', 'BEP20'] as const;

export default function SettingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { mode, setMode } = useThemeStore();
  const { user, logout, setUser } = useAuthStore();

  const [usdtType, setUsdtType] = useState<any>(user?.usdtType);
  const [address, setAddress] = useState(user?.usdtAddress ?? '');
  const [loading, setLoading] = useState(false);

  const saveWallet = async () => {
    if (!usdtType || !address) return;

    try {
      setLoading(true);
      const res = await api.patch('/settings', {
        usdtType,
        usdtAddress: address,
      });

      setUser({
        ...user!,
        ...res.data.settings,
      });

      alert('Wallet saved');
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Invalid wallet');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView
      edges={['top']}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <View style={styles.container}>
        {/* Appearance */}
        <Section title="Appearance">
          <Option
            label="Theme"
            value={mode}
            onPress={() => {
              const next =
                mode === 'system'
                  ? 'dark'
                  : mode === 'dark'
                  ? 'light'
                  : 'system';
              setMode(next);
              api.patch('/settings', { theme: next });
            }}
          />
        </Section>

        {/* Wallet */}
        <Section title="Wallet">
          <Option
            label="USDT Network"
            value={usdtType ?? 'Select'}
            onPress={() => {
              const next =
                USDT_TYPES[
                  (USDT_TYPES.indexOf(usdtType) + 1) % USDT_TYPES.length
                ];
              setUsdtType(next);
            }}
          />

          <View
            style={[styles.option, { backgroundColor: theme.colors.surface }]}
          >
            <TextInput
              placeholder="USDT Wallet Address"
              placeholderTextColor={theme.colors.muted}
              value={address}
              onChangeText={setAddress}
              style={{ color: theme.colors.text, flex: 1 }}
            />
          </View>

          <TouchableOpacity
            onPress={saveWallet}
            disabled={loading}
            style={[styles.saveBtn, { backgroundColor: theme.colors.primary }]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                Save Wallet
              </Text>
            )}
          </TouchableOpacity>
        </Section>

        {/* Account */}
        <Section title="Account">
          <TouchableOpacity
            onPress={async () => {
              await logout();
              router.replace('/(auth)/login');
            }}
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
    alignItems: 'center',
  },
  saveBtn: {
    marginTop: 8,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  logout: {
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
});
