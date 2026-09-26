import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { api } from '@/src/api/api';
import { UserAvatar } from '@/src/components/UserAvatar';
import { useTheme } from '@/src/theme/useTheme';
import { logger } from '@/src/utils/logger';

/**
 * Tells you someone wants to be friends, while you are in the app.
 *
 * A push notification already goes out, but push is easy to miss and does
 * nothing for someone who has notifications off or is looking at the app right
 * now — the request just sat unseen on the Friends screen. This surfaces it
 * where the player already is, with the two buttons that matter.
 *
 * One request at a time: a queue of modals would be worse than the silence it
 * replaces. The rest stay on the Friends screen, and the next one appears on
 * the following poll.
 */
type PendingRequest = {
  friendId: string;
  _id: string;
  username: string;
  avatar?: string | null;
};

/** Requests already shown, so declining to answer does not re-prompt forever. */
const seen = new Set<string>();

export function FriendRequestPrompt({ pollMs = 45_000 }: { pollMs?: number }) {
  const theme = useTheme();
  const [request, setRequest] = useState<PendingRequest | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    try {
      const res = await api.get('/friends/requests');
      const list: PendingRequest[] = res.data?.requests ?? [];
      const next = list.find((r) => r.friendId && !seen.has(r.friendId));
      if (next) {
        seen.add(next.friendId);
        setRequest(next);
      }
    } catch {
      // Offline or a blip — the next tick tries again. Never surfaced: a
      // failed background check is not something the player can act on.
    }
  }, []);

  useEffect(() => {
    check();
    const iv = setInterval(check, pollMs);
    return () => clearInterval(iv);
  }, [check, pollMs]);

  const respond = async (accept: boolean) => {
    if (!request || busy) return;
    setBusy(true);
    try {
      await api.post(accept ? '/friends/accept' : '/friends/decline', {
        friendId: request.friendId,
      });
      setRequest(null);
    } catch (err) {
      logger.warn('Friend request response failed', { error: String(err) });
      // Leave the sheet up so the tap can be retried rather than silently lost.
    } finally {
      setBusy(false);
    }
  };

  if (!request) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => setRequest(null)}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <UserAvatar avatar={request.avatar} size={56} />
          <Text style={[styles.title, { color: theme.colors.text }]}>Friend request</Text>
          <Text style={[styles.body, { color: theme.colors.muted }]}>
            <Text style={{ fontWeight: '800', color: theme.colors.text }}>{request.username}</Text>
            {' wants to be friends.'}
          </Text>

          <View style={styles.row}>
            <TouchableOpacity
              onPress={() => respond(false)}
              disabled={busy}
              style={[styles.btn, { backgroundColor: theme.colors.border }]}
              accessibilityRole="button"
              accessibilityLabel={`Decline friend request from ${request.username}`}
              hitSlop={8}
            >
              <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Decline</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => respond(true)}
              disabled={busy}
              style={[styles.btn, { backgroundColor: theme.colors.primary }]}
              accessibilityRole="button"
              accessibilityLabel={`Accept friend request from ${request.username}`}
              hitSlop={8}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '800' }}>Accept</Text>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => setRequest(null)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Decide later"
            hitSlop={8}
          >
            <Text style={{ color: theme.colors.muted, fontSize: 13 }}>Later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: { width: '100%', borderRadius: 22, padding: 22, alignItems: 'center', gap: 10 },
  title: { fontSize: 18, fontWeight: '900' },
  body: { textAlign: 'center', lineHeight: 20 },
  row: { flexDirection: 'row', gap: 12, marginTop: 8, width: '100%' },
  btn: { flex: 1, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
});
