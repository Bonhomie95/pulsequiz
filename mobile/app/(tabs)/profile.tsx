import { useAuthStore } from '@/src/store/useAuthStore';
import { useProgressStore } from '@/src/store/useProgressStore';
import { useTheme } from '@/src/theme/useTheme';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ProfileScreen() {
  const theme = useTheme();
  const { user } = useAuthStore();
  const { level, points } = useProgressStore();

  return (
    <SafeAreaView
      edges={['top']}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <View style={styles.container}>
        {/* Avatar */}
        <Image
          source={require('../../assets/avatars/avatar1.png')}
          style={styles.avatar}
        />

        {/* Username */}
        <Text style={[styles.username, { color: theme.colors.text }]}>
          {user?.username ?? 'Player'}
        </Text>

        {/* Level */}
        <Text style={{ color: theme.colors.muted }}>Level {level}</Text>

        {/* Stats */}
        <View style={styles.stats}>
          <Stat label="Points" value={points} />
          <Stat label="Quizzes" value={12} />
          <Stat label="Accuracy" value="78%" />
        </View>

        {/* Edit */}
        <TouchableOpacity
          style={[styles.editBtn, { backgroundColor: theme.colors.surface }]}
        >
          <Text style={{ color: theme.colors.text }}>Edit Profile</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

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

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 20,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    marginBottom: 12,
  },
  username: {
    fontSize: 20,
    fontWeight: '700',
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
  editBtn: {
    marginTop: 32,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 20,
  },
});
