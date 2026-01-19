import { useState, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Switch,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';

import { api } from '@/src/api/api';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useThemeStore } from '@/src/store/useThemeStore';
import { useAudioStore } from '@/src/store/useAudioStore';
import { useTheme } from '@/src/theme/useTheme';
import { soundManager } from '@/src/audio/SoundManager';
import { enterImmersiveMode } from '@/src/utils/immersive';
import { Toast } from '@/src/components/Toast';

const USDT_TYPES = ['TRC20', 'ERC20', 'BEP20'] as const;

export default function SettingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type?: 'success' | 'error';
  }>({
    visible: false,
    message: '',
  });

  const { mode, setMode } = useThemeStore();
  const { user, logout, setUser } = useAuthStore();

  const {
    muted,
    masterVolume,
    effectsVolume,
    setMuted,
    setMasterVolume,
    setEffectsVolume,
  } = useAudioStore();

  const [usdtType, setUsdtType] = useState(user?.usdtType);
  const [address, setAddress] = useState(user?.usdtAddress ?? '');
  const [showNetworkPicker, setShowNetworkPicker] = useState(false);
  const [loading, setLoading] = useState(false);

  const saveWallet = async () => {
    if (!usdtType || !address) return;

    try {
      setLoading(true);
      const res = await api.patch('/settings', {
        usdtType,
        usdtAddress: address,
      });

      setUser({ ...user!, ...res.data.settings });
      setToast({
        visible: true,
        message: 'Wallet saved successfully',
        type: 'success',
      });
    } catch (e: any) {
      setToast({
        visible: true,
        message: e?.response?.data?.message || 'Invalid wallet',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      enterImmersiveMode();
      // return () => exitImmersiveMode();
    }, []),
  );

  useEffect(() => {
    soundManager.setMuted(muted);
    soundManager.setMasterVolume(masterVolume);
    soundManager.setEffectsVolume(effectsVolume);

    // if user un-mutes, restart bg immediately
    if (!muted) soundManager.startBackground();
  }, [muted, masterVolume, effectsVolume]);

  return (
    <SafeAreaView
      edges={['top']}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <View style={styles.container}>
        {/* APPEARANCE */}
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

        {/* AUDIO */}
        <Section title="Audio">
          <View
            style={[styles.option, { backgroundColor: theme.colors.surface }]}
          >
            <Text style={{ color: theme.colors.text }}>Mute sounds</Text>
            <Switch
              value={muted}
              onValueChange={setMuted}
              thumbColor={theme.colors.primary}
            />
          </View>

          <SliderBlock
            label="Master Volume"
            value={masterVolume}
            onChange={setMasterVolume}
          />

          <SliderBlock
            label="Effects Volume"
            value={effectsVolume}
            onChange={setEffectsVolume}
          />
        </Section>

        {/* WALLET */}
        <Section title="Wallet">
          <TouchableOpacity
            onPress={() => setShowNetworkPicker((v) => !v)}
            style={[styles.option, { backgroundColor: theme.colors.surface }]}
          >
            <Text style={{ color: theme.colors.text }}>USDT Network</Text>
            <Text style={{ color: theme.colors.muted }}>
              {usdtType ?? 'Select'}
            </Text>
          </TouchableOpacity>

          {showNetworkPicker && (
            <View style={{ marginBottom: 8 }}>
              {USDT_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => {
                    setUsdtType(t);
                    setShowNetworkPicker(false);
                  }}
                  style={[
                    styles.option,
                    {
                      backgroundColor:
                        usdtType === t
                          ? theme.colors.primary
                          : theme.colors.surface,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: usdtType === t ? '#fff' : theme.colors.text,
                      fontWeight: '700',
                    }}
                  >
                    {t}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

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

        {/* ACCOUNT */}
        <Section title="Logout">
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
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((t) => ({ ...t, visible: false }))}
      />
    </SafeAreaView>
  );
}

/* ---------------- HELPERS ---------------- */

function SliderBlock({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: theme.colors.muted, marginBottom: 6 }}>
        {label} ({Math.round(value * 100)}%)
      </Text>
      <Slider
        minimumValue={0}
        maximumValue={1}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor={theme.colors.primary}
        maximumTrackTintColor={theme.colors.muted}
        thumbTintColor={theme.colors.primary}
      />
    </View>
  );
}

function Section({ title, children }: any) {
  const theme = useTheme();
  return (
    <View style={{ marginBottom: 28 }}>
      <Text
        style={{ color: theme.colors.muted, marginBottom: 8, fontSize: 13 }}
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

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  container: { padding: 20 },

  option: {
    padding: 16,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
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
