import { useState, useEffect, useCallback } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View, Switch,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  Palette, Volume2, VolumeX, Wallet2, LogOut,
  ChevronRight, Shield, Bell, Moon, Sun, Monitor,
} from 'lucide-react-native';

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
  const router  = useRouter();
  const theme   = useTheme();
  const { mode, setMode } = useThemeStore();
  const { user, logout, setUser } = useAuthStore();
  const { muted, masterVolume, effectsVolume, setMuted, setMasterVolume, setEffectsVolume } = useAudioStore();

  const [usdtType, setUsdtType]   = useState(user?.usdtType);
  const [address, setAddress]     = useState(user?.usdtAddress ?? '');
  const [networkOpen, setNetworkOpen] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [publicProfile, setPublicProfile] = useState(user?.publicProfile !== false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });

  const showToast = (message: string, type: 'success' | 'error' = 'success') =>
    setToast({ visible: true, message, type });

  const saveWallet = async () => {
    if (!usdtType || !address) return;
    try {
      setLoading(true);
      const res = await api.patch('/settings', { usdtType, usdtAddress: address });
      setUser({ ...user!, ...res.data.settings });
      showToast('Wallet saved successfully ✓');
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Save failed', 'error');
    } finally { setLoading(false); }
  };

  useFocusEffect(useCallback(() => { enterImmersiveMode(); }, []));

  useEffect(() => {
    soundManager.setMuted(muted);
    soundManager.setMasterVolume(masterVolume);
    soundManager.setEffectsVolume(effectsVolume);
    if (!muted) soundManager.startBackground();
  }, [muted, masterVolume, effectsVolume]);

  const themeLabel = mode === 'system' ? 'System default' : mode === 'dark' ? 'Dark mode' : 'Light mode';
  const ThemeIcon  = mode === 'system' ? Monitor : mode === 'dark' ? Moon : Sun;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.pageTitle, { color: theme.colors.text }]}>Settings</Text>

        {/* ── APPEARANCE ── */}
        <SectionHeader title="Appearance" icon={<Palette size={15} color={theme.colors.muted} />} />
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <TouchableOpacity
            onPress={() => {
              const next = mode === 'system' ? 'dark' : mode === 'dark' ? 'light' : 'system';
              setMode(next);
              api.patch('/settings', { theme: next });
            }}
            style={styles.cardRow}
          >
            <ThemeIcon size={18} color={theme.colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: theme.colors.text }]}>Theme</Text>
              <Text style={[styles.rowSub, { color: theme.colors.muted }]}>{themeLabel}</Text>
            </View>
            <ChevronRight size={16} color={theme.colors.muted} />
          </TouchableOpacity>
        </View>

        {/* ── AUDIO ── */}
        <SectionHeader title="Audio" icon={<Volume2 size={15} color={theme.colors.muted} />} />
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <View style={[styles.cardRow, styles.rowBorder, { borderBottomColor: theme.colors.border }]}>
            {muted ? <VolumeX size={18} color={theme.colors.muted} /> : <Volume2 size={18} color={theme.colors.primary} />}
            <Text style={[styles.rowLabel, { color: theme.colors.text, flex: 1 }]}>Mute All Sounds</Text>
            <Switch
              value={muted}
              onValueChange={setMuted}
              thumbColor={muted ? theme.colors.muted : theme.colors.primary}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary + '66' }}
            />
          </View>
          <View style={[styles.sliderRow, styles.rowBorder, { borderBottomColor: theme.colors.border }]}>
            <Text style={[styles.sliderLabel, { color: theme.colors.muted }]}>
              Master Volume  <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{Math.round(masterVolume * 100)}%</Text>
            </Text>
            <Slider
              minimumValue={0} maximumValue={1} value={masterVolume} onValueChange={setMasterVolume}
              minimumTrackTintColor={theme.colors.primary} maximumTrackTintColor={theme.colors.border}
              thumbTintColor={theme.colors.primary}
            />
          </View>
          <View style={styles.sliderRow}>
            <Text style={[styles.sliderLabel, { color: theme.colors.muted }]}>
              Effects Volume  <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{Math.round(effectsVolume * 100)}%</Text>
            </Text>
            <Slider
              minimumValue={0} maximumValue={1} value={effectsVolume} onValueChange={setEffectsVolume}
              minimumTrackTintColor={theme.colors.primary} maximumTrackTintColor={theme.colors.border}
              thumbTintColor={theme.colors.primary}
            />
          </View>
        </View>

        {/* ── WALLET ── */}
        <SectionHeader title="USDT Wallet" icon={<Wallet2 size={15} color={theme.colors.muted} />} />
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          {/* Network picker */}
          <TouchableOpacity
            onPress={() => setNetworkOpen((v) => !v)}
            style={[styles.cardRow, styles.rowBorder, { borderBottomColor: theme.colors.border }]}
          >
            <Text style={{ fontSize: 18 }}>🌐</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: theme.colors.text }]}>Network</Text>
              <Text style={[styles.rowSub, { color: usdtType ? theme.colors.primary : theme.colors.muted }]}>
                {usdtType ?? 'Select a network'}
              </Text>
            </View>
            <ChevronRight size={16} color={theme.colors.muted} style={{ transform: [{ rotate: networkOpen ? '90deg' : '0deg' }] }} />
          </TouchableOpacity>

          {networkOpen && (
            <View style={[styles.networkList, { borderBottomColor: theme.colors.border }]}>
              {USDT_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => { setUsdtType(t); setNetworkOpen(false); }}
                  style={[
                    styles.networkOption,
                    { backgroundColor: usdtType === t ? theme.colors.primary + '22' : 'transparent' },
                  ]}
                >
                  <Text style={[styles.networkLabel, { color: usdtType === t ? theme.colors.primary : theme.colors.text }]}>
                    {t}
                  </Text>
                  {usdtType === t && <Text style={{ color: theme.colors.primary }}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Address input */}
          <View style={[styles.cardRow, styles.rowBorder, { borderBottomColor: theme.colors.border }]}>
            <Text style={{ fontSize: 18 }}>📋</Text>
            <TextInput
              placeholder="USDT wallet address"
              placeholderTextColor={theme.colors.muted}
              value={address}
              onChangeText={setAddress}
              style={[styles.addressInput, { color: theme.colors.text }]}
            />
          </View>

          <TouchableOpacity onPress={saveWallet} disabled={loading} style={[styles.saveWalletBtn, { backgroundColor: theme.colors.primary }]}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Save Wallet</Text>}
          </TouchableOpacity>

          {user?.usdtAddress && (
            <Text style={[styles.walletHint, { color: theme.colors.muted }]}>
              ⚠️ Double-check your address — payouts to wrong addresses cannot be recovered.
            </Text>
          )}
        </View>

        {/* ── PRIVACY ── */}
        <SectionHeader title="Privacy" icon={<Shield size={15} color={theme.colors.muted} />} />
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.cardRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: theme.colors.text }]}>Show me as "Ready to Play"</Text>
              <Text style={[styles.rowSub, { color: theme.colors.muted }]}>
                Let others see your username in the home screen carousel and challenge you directly
              </Text>
            </View>
            <Switch
              value={publicProfile}
              onValueChange={async (val) => {
                setPublicProfile(val);
                try {
                  const res = await api.patch('/settings', { publicProfile: val });
                  setUser({ ...user!, publicProfile: res.data.settings.publicProfile });
                  showToast(val ? 'You\'re now visible to other players' : 'You\'re now hidden from the carousel');
                } catch {
                  setPublicProfile(!val); // revert on error
                  showToast('Failed to save', 'error');
                }
              }}
              thumbColor={publicProfile ? theme.colors.primary : theme.colors.muted}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary + '66' }}
            />
          </View>
        </View>

        {/* ── ACCOUNT ── */}
        <SectionHeader title="Account" icon={<Shield size={15} color={theme.colors.muted} />} />
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <View style={[styles.cardRow, { paddingVertical: 12 }]}>
            <Text style={{ fontSize: 18 }}>📧</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: theme.colors.text }]}>Email</Text>
              <Text style={[styles.rowSub, { color: theme.colors.muted }]}>{user?.email}</Text>
            </View>
          </View>
        </View>

        {/* ── LOGOUT ── */}
        <TouchableOpacity
          onPress={async () => { await logout(); router.replace('/(auth)/login'); }}
          style={[styles.logoutBtn, { backgroundColor: theme.colors.danger + '22', borderColor: theme.colors.danger + '44' }]}
        >
          <LogOut size={18} color={theme.colors.danger} />
          <Text style={[styles.logoutText, { color: theme.colors.danger }]}>Log Out</Text>
        </TouchableOpacity>

        <Text style={[styles.version, { color: theme.colors.muted }]}>PulseQuiz v1.0</Text>
      </ScrollView>

      <Toast
        visible={toast.visible} message={toast.message} type={toast.type}
        onHide={() => setToast((t) => ({ ...t, visible: false }))}
      />
    </SafeAreaView>
  );
}

function SectionHeader({ title, icon }: { title: string; icon: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.sectionHeader}>
      {icon}
      <Text style={[styles.sectionTitle, { color: theme.colors.muted }]}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 100 },
  pageTitle: { fontSize: 26, fontWeight: '900', marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: 6 },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  card: { borderRadius: 18, marginBottom: 20, overflow: 'hidden' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowBorder: { borderBottomWidth: 1 },
  rowLabel: { fontSize: 14, fontWeight: '600' },
  rowSub: { fontSize: 12, marginTop: 1 },
  sliderRow: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  sliderLabel: { fontSize: 13, marginBottom: 4 },
  networkList: { paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1 },
  networkOption: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4,
  },
  networkLabel: { fontWeight: '700', fontSize: 14 },
  addressInput: { flex: 1, fontSize: 13, paddingVertical: 2 },
  saveWalletBtn: { margin: 14, marginTop: 8, padding: 14, borderRadius: 14, alignItems: 'center' },
  walletHint: { fontSize: 12, paddingHorizontal: 16, paddingBottom: 14, lineHeight: 17 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, padding: 16, borderRadius: 18, borderWidth: 1, marginBottom: 16,
  },
  logoutText: { fontWeight: '700', fontSize: 16 },
  version: { textAlign: 'center', fontSize: 12, marginBottom: 10 },
});
