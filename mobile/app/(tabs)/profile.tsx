import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/src/api/api';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useTheme } from '@/src/theme/useTheme';
import { AVATAR_MAP } from '@/src/constants/avatars';
import { AvatarPickerModal } from '@/src/components/profile/AvatarPickerModal';
import { enterImmersiveMode } from '@/src/utils/immersive';
import { useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

function resolveAvatar(key?: any) {
  return AVATAR_MAP[key ?? 'avatar0'] ?? AVATAR_MAP.avatar0;
}

export default function ProfileScreen() {
  const theme = useTheme();
  const { user, updateUser } = useAuthStore();

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

  /** 🔒 SOURCE OF TRUTH (persisted user) */
  const originalUsername = user?.username ?? '';
  const originalAvatar = user?.avatar ?? 'avatar0';

  /** ✏️ EDIT STATE */
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState(originalUsername);
  const [avatar, setAvatar] = useState(originalAvatar);

  const [loading, setLoading] = useState(false);
  const [avatarModal, setAvatarModal] = useState(false);

  /** 📊 Load stats */
  useEffect(() => {
    api.get('/profile').then((res) => {
      setStats(res.data.stats);
      setLastQuizzes(res.data.lastQuizzes || []);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      enterImmersiveMode();
      // return () => exitImmersiveMode();
    }, []),
  );

  /** ✏️ Enter edit mode */
  const startEditing = () => {
    setUsername(originalUsername);
    setAvatar(originalAvatar);
    setEditing(true);
  };

  /** ❌ Cancel edit */
  const cancelEditing = () => {
    setUsername(originalUsername);
    setAvatar(originalAvatar);
    setEditing(false);
  };

  /** ✅ Save profile */
  const saveProfile = async () => {
    if (!username || username.length < 3) return;

    try {
      setLoading(true);

      const res = await api.patch('/profile', {
        username,
        avatar,
      });

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

  return (
    <SafeAreaView
      edges={['top']}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <View style={styles.container}>
        {/* ================= AVATAR ================= */}
        <TouchableOpacity
          onPress={() => {
            if (!editing) {
              setEditing(true);
            }
            setAvatarModal(true);
          }}
          style={styles.avatarWrap}
          activeOpacity={0.8}
        >
          <Image
            source={resolveAvatar(editing ? avatar : user?.avatar)}
            style={styles.avatar}
          />

          <View style={[styles.editBadge, !editing && { opacity: 0.5 }]}>
            <Text style={styles.editText}>✎</Text>
          </View>
        </TouchableOpacity>

        {/* ================= USERNAME ================= */}
        {editing ? (
          <TextInput
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            style={[
              styles.input,
              {
                color: theme.colors.text,
                borderColor: theme.colors.surface,
              },
            ]}
          />
        ) : (
          <Text style={[styles.username, { color: theme.colors.text }]}>
            {originalUsername}
          </Text>
        )}

        {/* ================= LEVEL ================= */}
        <Text style={{ color: theme.colors.muted }}>
          Level {stats?.level ?? '-'}
        </Text>

        {/* ================= STATS ================= */}
        <View style={styles.stats}>
          <Stat label="Points" value={stats?.points ?? '-'} />
          <Stat label="Quizzes" value={stats?.totalQuizzes ?? '-'} />
          <Stat
            label="Accuracy"
            value={stats?.accuracy !== undefined ? `${stats.accuracy}%` : '-'}
          />
        </View>

        {/* ================= ACTIONS ================= */}
        {!editing && (
          <TouchableOpacity
            onPress={startEditing}
            style={[
              styles.primaryBtn,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <Text style={{ color: theme.colors.text, fontWeight: '600' }}>
              Edit Profile
            </Text>
          </TouchableOpacity>
        )}

        {editing && (
          <View style={styles.editActions}>
            <TouchableOpacity
              onPress={cancelEditing}
              style={[
                styles.secondaryBtn,
                { backgroundColor: theme.colors.surface },
              ]}
            >
              <Text style={{ color: theme.colors.text }}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              disabled={loading}
              onPress={saveProfile}
              style={[
                styles.primaryBtn,
                { backgroundColor: theme.colors.primary },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '700' }}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ================= LAST 10 QUIZZES ================= */}
      {lastQuizzes.length > 0 && (
        <View style={{ marginTop: 36, width: '100%', alignItems: 'center' }}>
          <Text
            style={{
              color: theme.colors.muted,
              marginBottom: 14,
              fontSize: 13,
              letterSpacing: 0.5,
            }}
          >
            Last 10 Quizzes
          </Text>

          <ScrollView
            style={{ width: '100%' }}
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            {lastQuizzes.map((q, i) => {
              const perfect = q.accuracy === 100;

              return (
                <LinearGradient
                  key={i}
                  colors={
                    perfect
                      ? ['#22c55e', '#16a34a'] // 🌟 perfect
                      : [theme.colors.surface, theme.colors.background]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    borderRadius: 22,
                    padding: 16,
                    marginBottom: 14,
                    shadowColor: perfect ? '#22c55e' : '#000',
                    shadowOpacity: perfect ? 0.35 : 0.15,
                    shadowRadius: perfect ? 12 : 6,
                    elevation: perfect ? 8 : 4,
                  }}
                >
                  {/* HEADER */}
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      style={{
                        color: perfect ? '#fff' : theme.colors.text,
                        fontSize: 16,
                        fontWeight: '700',
                      }}
                    >
                      {q.category}
                    </Text>

                    {perfect && (
                      <View
                        style={{
                          backgroundColor: 'rgba(255,255,255,0.2)',
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 12,
                        }}
                      >
                        <Text
                          style={{
                            color: '#fff',
                            fontSize: 11,
                            fontWeight: '800',
                            letterSpacing: 0.8,
                          }}
                        >
                          PERFECT
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* META */}
                  <Text
                    style={{
                      color: perfect ? '#dcfce7' : theme.colors.muted,
                      marginTop: 6,
                      fontSize: 13,
                    }}
                  >
                    {q.answered} • {q.accuracy}%
                  </Text>

                  {/* FOOTER */}
                  <View
                    style={{
                      marginTop: 12,
                      alignSelf: 'flex-end',
                      backgroundColor: perfect
                        ? 'rgba(255,255,255,0.25)'
                        : theme.colors.primary,
                      paddingHorizontal: 14,
                      paddingVertical: 6,
                      borderRadius: 14,
                    }}
                  >
                    <Text
                      style={{
                        color: '#fff',
                        fontWeight: '800',
                        fontSize: 13,
                      }}
                    >
                      +{q.points} pts
                    </Text>
                  </View>
                </LinearGradient>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ================= AVATAR MODAL ================= */}
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

/* ================= STAT CARD ================= */
function Stat({ label, value }: { label: string; value: any }) {
  const theme = useTheme();
  return (
    <View style={[styles.statCard, { backgroundColor: theme.colors.surface }]}>
      <Text style={{ color: theme.colors.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: theme.colors.text, fontWeight: '700' }}>
        {value}
      </Text>
    </View>
  );
}

/* ================= STYLES ================= */
const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 20,
  },

  avatarWrap: {
    position: 'relative',
    marginBottom: 12,
  },

  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },

  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#000',
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },

  editText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },

  username: {
    fontSize: 20,
    fontWeight: '700',
  },

  input: {
    fontSize: 18,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 6,
    minWidth: 160,
    textAlign: 'center',
  },

  stats: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },

  statCard: {
    padding: 14,
    borderRadius: 16,
    alignItems: 'center',
    minWidth: 90,
  },

  editActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 32,
  },

  primaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 22,
    marginTop: 6,
  },

  secondaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 22,
  },
});
