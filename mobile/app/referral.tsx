import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Share2, Gift, Users, Copy } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { api } from '@/src/api/api';
import { useTheme } from '@/src/theme/useTheme';
import { useCoinStore } from '@/src/store/useCoinStore';
import { Toast } from '@/src/components/Toast';

export default function ReferralScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { addCoins } = useCoinStore();

  const [myCode, setMyCode]     = useState('');
  const [stats, setStats]       = useState({ total: 0, rewarded: 0, coinsEarned: 0 });
  const [loading, setLoading]   = useState(true);
  const [inputCode, setInputCode] = useState('');
  const [applying, setApplying] = useState(false);
  const [applied, setApplied]   = useState(false);
  const [toast, setToast]       = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });

  const showToast = (message: string, type: 'success' | 'error' = 'success') =>
    setToast({ visible: true, message, type });

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const [codeRes, statsRes] = await Promise.all([
            api.get('/referrals/code'),
            api.get('/referrals'),
          ]);
          if (!active) return;
          setMyCode(codeRes.data.code);
          setStats(statsRes.data);
        } catch { /* silent */ }
        finally { if (active) setLoading(false); }
      })();
      return () => { active = false; };
    }, []),
  );

  const copyCode = async () => {
    await Clipboard.setStringAsync(myCode);
    showToast('Code copied!');
  };

  const shareCode = async () => {
    try {
      await Share.share({
        message: `Join PulseQuiz and earn coins! Use my referral code: ${myCode}\nDownload now and start winning USDT prizes! 🎮💰`,
        title: 'Join PulseQuiz',
      });
    } catch { /* cancelled */ }
  };

  const applyCode = async () => {
    const clean = inputCode.trim().toUpperCase();
    if (!clean) return;
    try {
      setApplying(true);
      await api.post('/referrals/apply', { code: clean });
      setApplied(true);
      showToast('Referral applied! Your friend will earn a reward when you complete your first quiz 🎉');
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? 'Invalid code', 'error');
    } finally {
      setApplying(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: theme.colors.surface }]}
        
            accessibilityRole="button"
            hitSlop={8}
            accessibilityLabel="Go back">
          <ChevronLeft size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.text }]}>Referrals</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
        style={{ flex: 1 }}
      >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero banner */}
        <LinearGradient
          colors={[theme.colors.primary, theme.colors.secondary + 'AA']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Gift size={36} color="#fff" />
          <Text style={styles.heroTitle}>Earn 100 Coins Per Referral</Text>
          <Text style={styles.heroSub}>
            Share your code. When your friend completes their first quiz, you both get rewarded!
          </Text>
        </LinearGradient>

        {/* Stats row */}
        <View style={[styles.statsRow, { backgroundColor: theme.colors.surface }]}>
          <StatItem label="Friends Referred" value={stats.total} icon="👥" />
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          <StatItem label="Rewarded" value={stats.rewarded} icon="✅" />
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          <StatItem label="Coins Earned" value={stats.coinsEarned} icon="🪙" />
        </View>

        {/* My code */}
        {loading ? (
          <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 24 }} />
        ) : myCode ? (
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.sectionLabel, { color: theme.colors.muted }]}>Your Referral Code</Text>
            <View style={styles.codeRow}>
              <Text style={[styles.code, { color: theme.colors.primary }]}>{myCode}</Text>
              <TouchableOpacity onPress={copyCode} style={[styles.iconBtn, { backgroundColor: theme.colors.background }]}
            accessibilityRole="button"
            hitSlop={8}
            accessibilityLabel="Copy to clipboard">
                <Copy size={18} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={shareCode}
              style={[styles.shareBtn, { backgroundColor: theme.colors.primary }]}
            
            accessibilityRole="button"
            accessibilityLabel="Share with Friends"
            hitSlop={8}>
              <Share2 size={18} color="#fff" />
              <Text style={styles.shareBtnText}>Share with Friends</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.sectionLabel, { color: theme.colors.muted }]}>Your Referral Code</Text>
            <Text style={{ color: theme.colors.muted, fontSize: 13, lineHeight: 20 }}>
              Your referral code is generated from your username. Make sure you have set a username in your profile to use this feature.
            </Text>
          </View>
        )}

        {/* Enter a code */}
        {!applied && (
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.sectionLabel, { color: theme.colors.muted }]}>Enter a Referral Code</Text>
            <Text style={{ color: theme.colors.muted, fontSize: 12, marginBottom: 12 }}>
              Have a friend&apos;s code? Enter it below and they&apos;ll get coins when you finish your first quiz.
            </Text>
            <View style={styles.inputRow}>
              <TextInput
                value={inputCode}
                onChangeText={(t) => setInputCode(t.toUpperCase())}
                placeholder="e.g. REF-PLAYER1"
                placeholderTextColor={theme.colors.muted}
                autoCapitalize="characters"
                style={[styles.codeInput, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}
              />
              <TouchableOpacity
                onPress={applyCode}
                disabled={applying || !inputCode.trim()}
                style={[styles.applyBtn, { backgroundColor: theme.colors.primary, opacity: inputCode.trim() ? 1 : 0.5 }]}
              
            accessibilityRole="button"
            accessibilityLabel="Apply"
            hitSlop={8}>
                {applying
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={{ color: '#fff', fontWeight: '700' }}>Apply</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        )}

        {applied && (
          <View style={[styles.section, { backgroundColor: theme.colors.success + '22' }]}>
            <Text style={{ color: theme.colors.success, fontWeight: '700', textAlign: 'center', fontSize: 15 }}>
              ✅ Referral code applied! Complete your first quiz to reward your friend.
            </Text>
          </View>
        )}

        {/* How it works */}
        <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.sectionLabel, { color: theme.colors.muted }]}>How It Works</Text>
          {[
            { step: '1', text: 'Share your referral code with a friend' },
            { step: '2', text: 'Friend signs up and enters your code' },
            { step: '3', text: 'When they complete their first quiz, you earn 100 coins!' },
          ].map((item) => (
            <View key={item.step} style={styles.howRow}>
              <View style={[styles.stepBadge, { backgroundColor: theme.colors.primary }]}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{item.step}</Text>
              </View>
              <Text style={[styles.howText, { color: theme.colors.text }]}>{item.text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((t) => ({ ...t, visible: false }))}
      />
    </SafeAreaView>
  );
}

function StatItem({ label, value, icon }: { label: string; value: number; icon: string }) {
  const theme = useTheme();
  return (
    <View style={styles.statItem}>
      <Text style={{ fontSize: 20 }}>{icon}</Text>
      <Text style={[styles.statValue, { color: theme.colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.colors.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800' },
  scroll: { padding: 16, paddingBottom: 100 },
  hero: {
    borderRadius: 20, padding: 24, alignItems: 'center', gap: 10, marginBottom: 16,
  },
  heroTitle: { color: '#fff', fontSize: 20, fontWeight: '900', textAlign: 'center' },
  heroSub: { color: 'rgba(255,255,255,0.85)', textAlign: 'center', fontSize: 13, lineHeight: 20 },
  statsRow: {
    flexDirection: 'row', borderRadius: 16, padding: 16,
    justifyContent: 'space-around', marginBottom: 16,
  },
  statItem: { alignItems: 'center', gap: 4, flex: 1 },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, textAlign: 'center' },
  divider: { width: 1, marginVertical: 4 },
  section: { borderRadius: 20, padding: 18, marginBottom: 16 },
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 },
  codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  code: { fontSize: 26, fontWeight: '900', letterSpacing: 2 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 16,
  },
  shareBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  inputRow: { flexDirection: 'row', gap: 10 },
  codeInput: {
    flex: 1, borderWidth: 1.5, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontWeight: '700', letterSpacing: 1,
  },
  applyBtn: { paddingHorizontal: 20, borderRadius: 14, justifyContent: 'center' },
  howRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  stepBadge: { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center', marginTop: 1 },
  howText: { flex: 1, fontSize: 14, lineHeight: 20 },
});
