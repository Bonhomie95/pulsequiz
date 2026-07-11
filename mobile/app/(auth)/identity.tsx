import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
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

const AVATAR_KEYS = Object.keys(AVATAR_MAP);
const CUSTOM_TILE = '__custom__';

type Status = 'idle' | 'checking' | 'taken' | 'available' | 'offensive';

export default function IdentityScreen() {
  const theme = useTheme();
  const router = useRouter();
  const updateUser = useAuthStore((s) => s.updateUser);

  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null); // preset key or emoji
  const [customEmoji, setCustomEmoji] = useState('');
  const [showEmojiInput, setShowEmojiInput] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [submitting, setSubmitting] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Live availability check (debounced 500ms) ─────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const name = username.trim();
    if (name.length < 3) {
      setStatus('idle');
      return;
    }

    setStatus('checking');
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await api.get('/auth/username-check', {
          params: { username: name },
        });
        if (r.data.allowed === false && r.data.reason === 'offensive') {
          setStatus('offensive');
        } else {
          setStatus(r.data.available ? 'available' : 'taken');
        }
      } catch {
        setStatus('idle'); // network hiccup — the server re-checks on submit
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [username]);

  const canContinue =
    username.trim().length >= 3 &&
    avatar !== null &&
    status !== 'taken' &&
    status !== 'offensive' &&
    !submitting;

  const submit = async () => {
    if (!canContinue || !avatar) return;
    setSubmitting(true);
    try {
      const r = await api.post('/auth/identity', {
        username: username.trim(),
        avatar,
      });

      updateUser({
        username: r.data.user.username,
        avatar: r.data.user.avatar,
      });

      router.replace('/(tabs)/home');
    } catch (e: any) {
      const msg = e?.response?.data?.message as string | undefined;
      if (e?.response?.status === 409) {
        setStatus('taken');
      } else if (msg) {
        // Moderation warning or ban message from the server
        Alert.alert('Not allowed', msg);
        if (e?.response?.status === 403) {
          // Account banned — nothing further to do here
        }
      } else {
        Alert.alert('Error', 'Could not save your identity. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const pickCustomEmoji = () => {
    const trimmed = customEmoji.trim();
    if (!trimmed) return;
    setAvatar(trimmed);
    setShowEmojiInput(false);
  };

  const gridData = [...AVATAR_KEYS, CUSTOM_TILE];
  const isCustomSelected = avatar !== null && !AVATAR_KEYS.includes(avatar);

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
            autoCorrect={false}
            maxLength={20}
            style={[
              styles.input,
              {
                color: theme.colors.text,
                borderColor:
                  status === 'taken' || status === 'offensive'
                    ? theme.colors.danger
                    : status === 'available'
                      ? theme.colors.success
                      : theme.colors.surface,
              },
            ]}
          />
          {status === 'checking' && (
            <Text style={[styles.helper, { color: theme.colors.muted }]}>
              Checking…
            </Text>
          )}
          {status === 'taken' && (
            <Text style={[styles.helper, { color: theme.colors.danger }]}>
              Username taken
            </Text>
          )}
          {status === 'offensive' && (
            <Text style={[styles.helper, { color: theme.colors.danger }]}>
              This username isn't allowed
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
          data={gridData}
          numColumns={3}
          keyExtractor={(k) => k}
          columnWrapperStyle={{ gap: 16 }}
          contentContainerStyle={{ gap: 16 }}
          renderItem={({ item }) =>
            item === CUSTOM_TILE ? (
              <TouchableOpacity
                onPress={() => setShowEmojiInput(true)}
                style={[
                  styles.avatarWrap,
                  styles.customTile,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: isCustomSelected
                      ? theme.colors.primary
                      : 'transparent',
                  },
                ]}
              >
                <Text style={styles.customEmoji}>
                  {isCustomSelected ? avatar : '➕'}
                </Text>
                <Text style={[styles.customLabel, { color: theme.colors.muted }]}>
                  Custom
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => setAvatar(item)}
                style={[
                  styles.avatarWrap,
                  {
                    borderColor:
                      avatar === item ? theme.colors.primary : 'transparent',
                  },
                ]}
              >
                <Image
                  source={AVATAR_MAP[item as keyof typeof AVATAR_MAP]}
                  style={styles.avatar}
                />
              </TouchableOpacity>
            )
          }
        />

        {/* Custom emoji input */}
        {showEmojiInput && (
          <View style={styles.emojiRow}>
            <TextInput
              placeholder="Type one emoji 😎"
              placeholderTextColor={theme.colors.muted}
              value={customEmoji}
              onChangeText={setCustomEmoji}
              maxLength={8}
              autoFocus
              style={[
                styles.input,
                styles.emojiInput,
                { color: theme.colors.text, borderColor: theme.colors.surface },
              ]}
            />
            <TouchableOpacity
              onPress={pickCustomEmoji}
              style={[styles.emojiBtn, { backgroundColor: theme.colors.primary }]}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>Use</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Moderation notice */}
        <Text style={[styles.warning, { color: theme.colors.muted }]}>
          Offensive or abusive usernames and avatars are not allowed. Repeated
          attempts will get your account banned.
        </Text>

        {/* Continue */}
        <TouchableOpacity
          disabled={!canContinue}
          onPress={submit}
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
            {submitting ? 'Saving…' : 'Continue'}
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
  customTile: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customEmoji: {
    fontSize: 30,
    lineHeight: 36,
  },
  customLabel: {
    fontSize: 10,
    marginTop: 2,
  },
  emojiRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    alignItems: 'center',
  },
  emojiInput: {
    flex: 1,
  },
  emojiBtn: {
    height: 54,
    paddingHorizontal: 20,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  warning: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 14,
    textAlign: 'center',
  },
  cta: {
    height: 56,
    borderRadius: 28,
    marginTop: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
