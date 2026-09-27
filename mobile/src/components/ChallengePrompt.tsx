import { useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { usePathname, useRouter } from 'expo-router';

import { getSocket } from '@/src/socket/socket';
import { SOCKET_EVENTS } from '@/src/socket/events';
import { UserAvatar } from '@/src/components/UserAvatar';
import { useTheme } from '@/src/theme/useTheme';
import { soundManager } from '@/src/audio/SoundManager';
import { ChallengeSheet } from '@/src/components/ChallengeSheet';
import { COIN_NAME } from '@/src/constants/currency';

/**
 * "X wants to play you" — wherever you are in the app.
 *
 * Mounted at the root rather than on one screen, because a challenge is only
 * worth sending if it can reach someone mid-quiz or sitting on the home tab.
 * A push goes out too, for when the app is closed; this is the other half.
 *
 * Nothing is polled: the invite arrives on the socket that is already open.
 * Accepting does not navigate — the server builds the match and the app-wide
 * MATCH_FOUND listener carries both players into it, the same path a rematch
 * takes.
 */
type Incoming = {
  challengeId: string;
  fromUsername: string;
  fromAvatar?: string;
  category?: string;
  wager?: number;
  expiresInMs?: number;
  /** They changed your terms and sent it back. */
  isCounter?: boolean;
};

const cap = (v?: string) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : '');

export function ChallengePrompt() {
  const theme = useTheme();
  const router = useRouter();
  // Read inside a socket handler that is registered once, so it has to be a
  // ref rather than the captured value.
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);
  const [invite, setInvite] = useState<Incoming | null>(null);
  /** The terms sheet, open while countering. */
  const [countering, setCountering] = useState<Incoming | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const socket = getSocket();

    const onIncoming = (p: Incoming) => {
      if (!p?.challengeId) return;
      setInvite(p);
      setSecondsLeft(Math.max(1, Math.round((p.expiresInMs ?? 90_000) / 1000)));
      soundManager.play('match_found');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    };

    // The challenger pulled out, it ran out of time, or they went offline.
    const onCancelled = () => {
      setInvite(null);
      setCountering(null);
    };
    /**
     * The match exists — get whoever is holding this screen into it.
     *
     * Navigating on MATCH_FOUND lived only on the search and result screens,
     * so the accepting player moved and the challenger did not: they had sent
     * the invite from the friends list or the home tab, where nothing was
     * listening, and sat there while their opponent was already answering.
     * This is mounted at the root, so it covers every case — including a
     * counter-offer, where the roles are the other way round.
     *
     * Guarded on the current route: the search screen does its own replace,
     * and pushing a second VS screen on top would leave one behind.
     */
    const onMatchFound = () => {
      setInvite(null);
      setCountering(null);
      if (!pathRef.current.startsWith('/quiz/pvp')) {
        router.push('/quiz/pvp/vs');
      }
    };

    socket.on(SOCKET_EVENTS.CHALLENGE_INCOMING, onIncoming);
    socket.on(SOCKET_EVENTS.CHALLENGE_CANCELLED, onCancelled);
    socket.on(SOCKET_EVENTS.MATCH_FOUND, onMatchFound);
    return () => {
      socket.off(SOCKET_EVENTS.CHALLENGE_INCOMING, onIncoming);
      socket.off(SOCKET_EVENTS.CHALLENGE_CANCELLED, onCancelled);
      socket.off(SOCKET_EVENTS.MATCH_FOUND, onMatchFound);
    };
  }, []);

  // Count it down rather than letting it hang there dead: the server drops
  // the invite on the same clock.
  useEffect(() => {
    if (!invite) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          setInvite(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [invite]);

  if (countering) {
    return (
      <ChallengeSheet
        visible
        mode="counter"
        opponentName={countering.fromUsername}
        initialCategory={countering.category}
        initialWager={countering.wager}
        onCancel={() => setCountering(null)}
        onConfirm={(category, wager) => {
          getSocket().emit(SOCKET_EVENTS.CHALLENGE_COUNTER, {
            challengeId: countering.challengeId,
            category,
            wager,
          });
          setCountering(null);
        }}
      />
    );
  }

  if (!invite) return null;

  const respond = (accept: boolean) => {
    const socket = getSocket();
    socket.emit(
      accept ? SOCKET_EVENTS.CHALLENGE_ACCEPT : SOCKET_EVENTS.CHALLENGE_DECLINE,
      { challengeId: invite.challengeId },
    );
    setInvite(null);
    if (accept) {
      // Somewhere to look while the server pairs us. MATCH_FOUND replaces this
      // with the real versus screen a moment later.
      router.push('/quiz/pvp/vs');
    }
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => respond(false)}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <UserAvatar avatar={invite.fromAvatar ?? ''} size={64} />

          <Text style={[styles.title, { color: theme.colors.text }]}>
            {invite.isCounter
              ? `${invite.fromUsername} changed the terms`
              : `${invite.fromUsername} wants to play`}
          </Text>
          <Text style={[styles.body, { color: theme.colors.muted }]}>
            {cap(invite.category) || '1v1'}
            {invite.wager ? ` · ${invite.wager} ${COIN_NAME.plural} staked` : ' · friendly'}
          </Text>
          <Text style={[styles.body, { color: theme.colors.muted }]}>
            Expires in {secondsLeft}s
          </Text>

          <TouchableOpacity
            onPress={() => respond(true)}
            accessibilityRole="button"
            accessibilityLabel={`Accept the challenge from ${invite.fromUsername}`}
            style={[styles.accept, { backgroundColor: theme.colors.primary }]}
          >
            <Text style={styles.acceptLabel}>Accept</Text>
          </TouchableOpacity>

          {/* Disagreeing about the stake should not mean saying no. */}
          <TouchableOpacity
            onPress={() => {
              setCountering(invite);
              setInvite(null);
            }}
            accessibilityRole="button"
            accessibilityLabel="Change the terms and send it back"
            style={[styles.change, { borderColor: theme.colors.border }]}
            hitSlop={8}
          >
            <Text style={{ color: theme.colors.text, fontWeight: '800' }}>
              Change terms
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => respond(false)}
            accessibilityRole="button"
            accessibilityLabel="Decline"
            style={styles.decline}
            hitSlop={8}
          >
            <Text style={{ color: theme.colors.muted, fontWeight: '700' }}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#000000aa',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  card: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  title: { marginTop: 14, fontSize: 19, fontWeight: '900', textAlign: 'center' },
  body: { marginTop: 4, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  accept: {
    marginTop: 18,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  acceptLabel: { color: '#fff', fontWeight: '800', fontSize: 15 },
  change: {
    marginTop: 10,
    width: '100%',
    paddingVertical: 13,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  decline: { marginTop: 10, paddingVertical: 8, paddingHorizontal: 16 },
});
