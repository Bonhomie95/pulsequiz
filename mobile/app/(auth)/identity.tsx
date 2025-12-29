import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AVATAR_MAP } from '../../src/constants/avatars';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useTheme } from '../../src/theme/useTheme';
import { api } from '@/src/api/api';

export default function IdentityScreen() {
  const theme = useTheme();
  const router = useRouter();
  const updateUser = useAuthStore((s) => s.updateUser);

  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState<number | null>(null);
  const [status, setStatus] = useState<
    'idle' | 'checking' | 'taken' | 'available'
  >('idle');

  const canContinue = username.length >= 3 && avatar !== null;

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Choose your identity
        </Text>

        <Text style={[styles.subtitle, { color: theme.colors.muted }]}>
          This will be visible on leaderboards
        </Text>

        {/* Username */}
        <View style={styles.inputWrap}>
          <TextInput
            placeholder="username"
            placeholderTextColor={theme.colors.muted}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            style={[
              styles.input,
              {
                color: theme.colors.text,
                borderColor:
                  status === 'taken'
                    ? theme.colors.danger
                    : status === 'available'
                    ? theme.colors.success
                    : theme.colors.surface,
              },
            ]}
          />
          {status === 'checking' && (
            <Text style={styles.helper}>Checking…</Text>
          )}
          {status === 'taken' && (
            <Text style={[styles.helper, { color: theme.colors.danger }]}>
              Username taken
            </Text>
          )}
          {status === 'available' && (
            <Text style={[styles.helper, { color: theme.colors.success }]}>
              Username available
            </Text>
          )}
        </View>

        {/* Avatar Grid */}
        <Text style={[styles.section, { color: theme.colors.text }]}>
          Pick an avatar
        </Text>

        <FlatList
          data={Object.values(AVATAR_MAP)}
          numColumns={3}
          keyExtractor={(_, i) => i.toString()}
          columnWrapperStyle={{ gap: 16 }}
          contentContainerStyle={{ gap: 16 }}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              onPress={() => setAvatar(index)}
              style={[
                styles.avatarWrap,
                {
                  borderColor:
                    avatar === index ? theme.colors.primary : 'transparent',
                },
              ]}
            >
              <Image source={item} style={styles.avatar} />
            </TouchableOpacity>
          )}
        />

        {/* Continue */}
        <TouchableOpacity
          disabled={!canContinue}
          onPress={async () => {
            try {
              const r = await api.post('/auth/identity', {
                username,
                avatar: `avatar${avatar}`,
              });

              updateUser({
                username: r.data.user.username,
                avatar: r.data.user.avatar,
              });

              router.replace('/(tabs)/home');
            } catch (e: any) {
              setStatus('taken'); // backend said username conflict
            }
          }}
          style={[
            styles.cta,
            {
              backgroundColor: canContinue
                ? theme.colors.primary
                : theme.colors.surface,
            },
          ]}
        >
          <Text style={{ color: theme.colors.text, fontWeight: '600' }}>
            Continue
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 80,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 24,
  },
  inputWrap: {
    marginBottom: 24,
  },
  input: {
    height: 54,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  helper: {
    marginTop: 6,
    fontSize: 12,
  },
  section: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  avatarWrap: {
    borderWidth: 2,
    borderRadius: 50,
    padding: 4,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  cta: {
    height: 56,
    borderRadius: 28,
    marginTop: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
