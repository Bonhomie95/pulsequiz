import { useCallback, useEffect, useState } from 'react';
import {
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Edit3,
  ChevronRight,
  Trophy,
  Target,
  Zap,
  Gift,
} from 'lucide-react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { api } from '@/src/api/api';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useTheme } from '@/src/theme/useTheme';
import { UserAvatar } from '@/src/components/UserAvatar';
import { AvatarPickerModal } from '@/src/components/profile/AvatarPickerModal';
import { enterImmersiveMode } from '@/src/utils/immersive';
import { useCoinStore } from '@/src/store/useCoinStore';

export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, hydrated, updateUser } = useAuthStore();
  const { coins } = useCoinStore();

  const [stats, setStats] = useState<{
    points: number;
    level: number;
    totalQuizzes: number;
    accuracy: number;
  } | null>(null);
  const [lastQuizzes, setLastQuizzes] = useState<
    {
      category: string;
      answered: string;
      accuracy: number;
      points: number;
      date: string;
    }[]
  >([]);

  const originalUsername = user?.username ?? '';
  const originalAvatar = user?.avatar ?? 'avatar0';

  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState(originalUsername);
  const [avatar, setAvatar] = useState(originalAvatar);
  const [loading, setLoading] = useState(false);
  const [avatarModal, setAvatarModal] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    api
      .get('/profile')
      .then((res) => {
        setStats(res.data.stats);
        setLastQuizzes(res.data.lastQuizzes || []);
      })
      .catch(() => {});
  }, [hydrated]);

  useFocusEffect(
    useCallback(() => {
      enterImmersiveMode();
    }, []),
  );

  const startEditing = () => {
    setUsername(originalUsername);
    setAvatar(originalAvatar);
    setEditing(true);
  };
  const cancelEditing = () => {
    setUsername(originalUsername);
    setAvatar(originalAvatar);
    setEditing(false);
  };

  const saveProfile = async () => {
    if (!username || username.length < 3) return;
    try {
      setLoading(true);
      const res = await api.patch('/profile', { username, avatar });
      updateUser({
        username: res.data.user.username,
        avatar: res.data.user.avatar,
      });
      setEditing(false);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Update failed');
    } finally {
      setLoading(false);
    }
  };

  const levelProgress = stats
    ? Math.min(((stats.points % 100) / 100) * 100, 100)
    : 0;

  return (
    <SafeAreaView
      edges={['top']}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
        style={{ flex: 1 }}
      >
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HERO ── */}
        <LinearGradient
          colors={[theme.colors.primary + '44', theme.colors.background]}
          style={styles.hero}
        >
          {/* Avatar */}
          <TouchableOpacity
            onPress={() => {
              if (!editing) setEditing(true);
              setAvatarModal(true);
            }}
            style={styles.avatarWrap}
            activeOpacity={0.85}
          
            accessibilityRole="button"
            hitSlop={8}
            accessibilityLabel="Edit">
            <UserAvatar avatar={editing ? avatar : user?.avatar} size={96} />
            <View
              style={[
                styles.editBadge,
                { backgroundColor: theme.colors.primary },
              ]}
            >
              <Edit3 size={12} color="#fff" />
            </View>
          </TouchableOpacity>

          {/* Name */}
          {editing ? (
            <TextInput
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              style={[
                styles.nameInput,
                {
                  color: theme.colors.text,
                  borderColor: theme.colors.primary + '88',
                  backgroundColor: theme.colors.surface,
                },
              ]}
            />
          ) : (
            <Text style={[styles.name, { color: theme.colors.text }]}>
              {originalUsername}
            </Text>
          )}

          {/* Level badge */}
          <View
            style={[
              styles.levelBadge,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <Zap size={13} color={theme.colors.primary} />
            <Text style={[styles.levelText, { color: theme.colors.primary }]}>
              Level {stats?.level ?? '—'}
            </Text>
          </View>

          {/* Level progress bar */}
          {stats && (
            <View style={styles.progressWrap}>
              <View
                style={[
                  styles.progressTrack,
                  { backgroundColor: theme.colors.border },
                ]}
              >
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${levelProgress}%` as any,
                      backgroundColor: theme.colors.primary,
                    },
                  ]}
                />
              </View>
              <Text
                style={[styles.progressLabel, { color: theme.colors.muted }]}
              >
                {stats.points % 100}/100 to next level
              </Text>
            </View>
          )}

          {/* Edit actions */}
          {!editing ? (
            <TouchableOpacity
              onPress={startEditing}
              style={[
                styles.editBtn,
                { backgroundColor: theme.colors.surface },
              ]}
            
            accessibilityRole="button"
            accessibilityLabel="Edit Profile"
            hitSlop={8}>
              <Edit3 size={15} color={theme.colors.text} />
              <Text style={{ color: theme.colors.text, fontWeight: '600' }}>
                Edit Profile
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.editActions}>
              <TouchableOpacity
                onPress={cancelEditing}
                style={[
                  styles.cancelBtn,
                  { backgroundColor: theme.colors.surface },
                ]}
              
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            hitSlop={8}>
                <Text style={{ color: theme.colors.text }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={saveProfile}
                disabled={loading}
                style={[
                  styles.saveBtn,
                  { backgroundColor: theme.colors.primary },
                ]}
              
            accessibilityRole="button"
            accessibilityLabel="Save"
            hitSlop={8}>
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </LinearGradient>

        {/* ── STATS GRID ── */}
        <View style={styles.statsGrid}>
          {[
            {
              icon: <Trophy size={18} color="#FFB800" />,
              label: 'Points',
              value: stats?.points?.toLocaleString() ?? '—',
            },
            {
              icon: <Target size={18} color={theme.colors.primary} />,
              label: 'Quizzes',
              value: stats?.totalQuizzes ?? '—',
            },
            {
              icon: <Zap size={18} color={theme.colors.secondary} />,
              label: 'Accuracy',
              value: stats?.accuracy !== undefined ? `${stats.accuracy}%` : '—',
            },
            {
              icon: <Text style={{ fontSize: 18 }}>🪙</Text>,
              label: 'Coins',
              value: coins.toLocaleString(),
            },
          ].map((s, i) => (
            <View
              key={i}
              style={[
                styles.statCard,
                { backgroundColor: theme.colors.surface },
              ]}
            >
              {s.icon}
              <Text style={[styles.statValue, { color: theme.colors.text }]}>
                {s.value}
              </Text>
              <Text style={[styles.statLabel, { color: theme.colors.muted }]}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>

        {/* ── QUICK LINKS ── */}
        <View
          style={[styles.linksBox, { backgroundColor: theme.colors.surface }]}
        >
          {[
            {
              icon: '🎁',
              label: 'Referrals',
              sub: 'Earn 100 coins per friend',
              route: '/referral',
            },
            {
              icon: '🎯',
              label: 'Challenges',
              sub: 'Daily & weekly missions',
              route: '/challenges',
            },
            {
              icon: '👥',
              label: 'Friends',
              sub: 'Play with friends',
              route: '/friends',
            },
            {
              icon: '💰',
              label: 'Wallet & Payouts',
              sub: 'View coin history',
              route: '/wallet',
            },
          ].map((l, i) => (
            <TouchableOpacity
              key={l.label}
              onPress={() => router.push(l.route as any)}
              style={[
                styles.linkRow,
                i < 3 && {
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.border,
                },
              ]}
            
            accessibilityRole="button"
            hitSlop={8}
            accessibilityLabel="Next">
              <Text style={{ fontSize: 20, width: 32 }}>{l.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    { fontWeight: '700', fontSize: 14 },
                    { color: theme.colors.text },
                  ]}
                >
                  {l.label}
                </Text>
                <Text style={[{ fontSize: 12 }, { color: theme.colors.muted }]}>
                  {l.sub}
                </Text>
              </View>
              <ChevronRight size={16} color={theme.colors.muted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* ── RECENT QUIZZES ── */}
        {lastQuizzes.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              Recent Quizzes
            </Text>
            {lastQuizzes.map((q, i) => {
              const perfect = q.accuracy === 100;
              return (
                <LinearGradient
                  key={i}
                  colors={
                    perfect
                      ? ['#22c55e', '#16a34a']
                      : [theme.colors.surface, theme.colors.surface]
                  }
                  style={styles.quizCard}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.quizCat,
                        { color: perfect ? '#fff' : theme.colors.text },
                      ]}
                    >
                      {q.category}
                    </Text>
                    <Text
                      style={[
                        styles.quizMeta,
                        {
                          color: perfect
                            ? 'rgba(255,255,255,0.8)'
                            : theme.colors.muted,
                        },
                      ]}
                    >
                      {q.answered} · {q.accuracy}%
                    </Text>
                  </View>
                  <View style={styles.pointsBadge}>
                    <Text
                      style={{
                        color: perfect ? '#22c55e' : theme.colors.primary,
                        fontWeight: '800',
                        fontSize: 13,
                      }}
                    >
                      +{q.points}
                    </Text>
                    <Text style={{ color: theme.colors.muted, fontSize: 10 }}>
                      pts
                    </Text>
                  </View>
                  {perfect && (
                    <View style={styles.perfectBadge}>
                      <Text
                        style={{
                          color: '#fff',
                          fontSize: 10,
                          fontWeight: '800',
                          letterSpacing: 0.8,
                        }}
                      >
                        PERFECT
                      </Text>
                    </View>
                  )}
                </LinearGradient>
              );
            })}
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      <AvatarPickerModal
        visible={avatarModal}
        selected={avatar}
        onSelect={(a) => {
          setAvatar(a);
          setAvatarModal(false);
        }}
        onClose={() => setAvatarModal(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 100 },
  hero: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 28,
    paddingHorizontal: 20,
  },
  avatarWrap: { position: 'relative', marginBottom: 12 },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  editBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  name: { fontSize: 22, fontWeight: '800', marginBottom: 6 },
  nameInput: {
    fontSize: 18,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 9,
    minWidth: 180,
    textAlign: 'center',
    marginBottom: 8,
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 12,
  },
  levelText: { fontWeight: '700', fontSize: 13 },
  progressWrap: { width: '80%', marginBottom: 16 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: { height: '100%', borderRadius: 3 },
  progressLabel: { fontSize: 11, textAlign: 'center' },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 20,
  },
  editActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 22, borderRadius: 18 },
  saveBtn: { paddingVertical: 12, paddingHorizontal: 28, borderRadius: 18 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 16 },
  statCard: {
    width: '47%',
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    gap: 6,
  },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 12 },
  linksBox: {
    marginHorizontal: 16,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 24,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  quizCard: {
    marginHorizontal: 16,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quizCat: { fontSize: 14, fontWeight: '700' },
  quizMeta: { fontSize: 12, marginTop: 2 },
  pointsBadge: { alignItems: 'center' },
  perfectBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginLeft: 8,
  },
});
