import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { api, errorMessage } from '@/src/api/api';
import { UserAvatar } from '@/src/components/UserAvatar';
import { useTheme } from '@/src/theme/useTheme';

/**
 * One profile sheet for every list that shows a player.
 *
 * The friends screen had its own, with places for level, rank and games that
 * always read "—" because the lists it opened from never carried them. The
 * leaderboard had none at all — its rows, and especially the podium, were not
 * even tappable. Rather than widen three list endpoints with fields only this
 * sheet wants, it asks the server for the one player it is showing.
 *
 * The head-to-head block appears only for a friend: a record against someone
 * you have never been able to play says nothing.
 */
export type PlayerProfile = {
  userId: string;
  username: string;
  avatar: string;
  level: number;
  points: number;
  allTimeRank: number;
  gamesPlayed: number;
  isOnline: boolean;
  isInGame: boolean;
  friendStatus: 'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'blocked';
  headToHead: { wins: number; losses: number; draws: number; played: number } | null;
  isSelf: boolean;
};

export function PlayerProfileSheet({
  userId,
  onClose,
  onChallenge,
  onUnfriend,
  onBlock,
}: {
  /** Null closes the sheet. */
  userId: string | null;
  onClose: () => void;
  /** Omitted where challenging makes no sense. */
  onChallenge?: (p: PlayerProfile) => void;
  /** Only the Friends screen offers these. */
  onUnfriend?: (p: PlayerProfile) => void;
  onBlock?: (p: PlayerProfile) => void;
}) {
  const theme = useTheme();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setError(null);
      return;
    }
    let live = true;
    setProfile(null);
    setError(null);
    api
      .get(`/friends/${userId}/profile`)
      .then((res) => {
        if (live) setProfile(res.data);
      })
      .catch((e) => {
        if (live) setError(errorMessage(e, "Couldn't load that player."));
      });
    return () => {
      live = false;
    };
  }, [userId]);

  if (!userId) return null;

  const addFriend = async () => {
    if (!profile || busy) return;
    setBusy(true);
    try {
      await api.post('/friends/request', { targetUserId: profile.userId });
      setProfile({ ...profile, friendStatus: 'pending_sent' });
    } catch (e) {
      setError(errorMessage(e, "Couldn't send that request."));
    } finally {
      setBusy(false);
    }
  };

  const h2h = profile?.headToHead ?? null;
  const showH2H = profile?.friendStatus === 'accepted' && !!h2h;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.sheet, { backgroundColor: theme.colors.surface }]}
          accessibilityRole="none"
        >
          <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />

          {!profile && !error ? (
            <View style={{ paddingVertical: 48 }}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : error ? (
            <Text style={{ color: theme.colors.danger, padding: 24, textAlign: 'center' }}>
              {error}
            </Text>
          ) : profile ? (
            <>
              <View style={styles.header}>
                <View style={[styles.avatarRing, { borderColor: theme.colors.primary }]}>
                  <UserAvatar avatar={profile.avatar} size={74} />
                </View>
                {profile.isOnline && (
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: profile.isInGame ? '#FF6B00' : '#22C55E' },
                    ]}
                  />
                )}
                <Text style={[styles.name, { color: theme.colors.text }]}>
                  {profile.username}
                </Text>
                <Text style={{ color: theme.colors.muted, fontSize: 12, marginTop: 2 }}>
                  {profile.isInGame
                    ? 'In a game'
                    : profile.isOnline
                      ? 'Online'
                      : 'Offline'}
                </Text>
              </View>

              <View style={styles.stats}>
                <Stat label="Level" value={String(profile.level)} theme={theme} />
                <Stat
                  label="All-time"
                  value={profile.allTimeRank > 0 ? `#${profile.allTimeRank}` : '—'}
                  theme={theme}
                />
                <Stat label="Points" value={profile.points.toLocaleString()} theme={theme} />
                <Stat label="Games" value={String(profile.gamesPlayed)} theme={theme} />
              </View>

              {showH2H && h2h && (
                <View
                  style={[
                    styles.h2h,
                    { borderColor: theme.colors.border, backgroundColor: theme.colors.background },
                  ]}
                >
                  <Text style={[styles.h2hTitle, { color: theme.colors.muted }]}>
                    HEAD TO HEAD
                  </Text>
                  <Text style={[styles.h2hScore, { color: theme.colors.text }]}>
                    {h2h.wins} – {h2h.losses}
                    {h2h.draws > 0 ? `  (${h2h.draws} drawn)` : ''}
                  </Text>
                  <Text style={{ color: theme.colors.muted, fontSize: 12, marginTop: 2 }}>
                    {h2h.played === 0
                      ? 'Never played — challenge them'
                      : h2h.wins === h2h.losses
                        ? `All square after ${h2h.played}`
                        : h2h.wins > h2h.losses
                          ? 'You lead'
                          : 'They lead'}
                  </Text>
                </View>
              )}

              {!profile.isSelf && (
                <View style={{ gap: 10, marginTop: 20 }}>
                  {profile.friendStatus === 'accepted' && onChallenge && (
                    <TouchableOpacity
                      onPress={() => onChallenge(profile)}
                      accessibilityRole="button"
                      accessibilityLabel={`Challenge ${profile.username}`}
                      style={[styles.primary, { backgroundColor: theme.colors.primary }]}
                    >
                      <Text style={styles.primaryLabel}>Challenge</Text>
                    </TouchableOpacity>
                  )}

                  {profile.friendStatus === 'none' && (
                    <TouchableOpacity
                      disabled={busy}
                      onPress={addFriend}
                      accessibilityRole="button"
                      accessibilityLabel={`Send ${profile.username} a friend request`}
                      style={[
                        styles.primary,
                        { backgroundColor: theme.colors.primary, opacity: busy ? 0.6 : 1 },
                      ]}
                    >
                      <Text style={styles.primaryLabel}>Send friend request</Text>
                    </TouchableOpacity>
                  )}

                  {profile.friendStatus === 'pending_sent' && (
                    <View style={[styles.muted, { borderColor: theme.colors.border }]}>
                      <Text style={{ color: theme.colors.muted, fontWeight: '700' }}>
                        Request sent
                      </Text>
                    </View>
                  )}

                  {profile.friendStatus === 'pending_received' && (
                    <View style={[styles.muted, { borderColor: theme.colors.border }]}>
                      <Text style={{ color: theme.colors.muted, fontWeight: '700' }}>
                        They sent you a request — answer it on Friends
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {!profile.isSelf && (onUnfriend || onBlock) && (
                <View style={styles.destructive}>
                  {onUnfriend && profile.friendStatus === 'accepted' && (
                    <TouchableOpacity
                      onPress={() => onUnfriend(profile)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${profile.username} as a friend`}
                      hitSlop={8}
                    >
                      <Text style={{ color: theme.colors.danger, fontWeight: '700', fontSize: 13 }}>
                        Unfriend
                      </Text>
                    </TouchableOpacity>
                  )}
                  {onBlock && (
                    <TouchableOpacity
                      onPress={() => onBlock(profile)}
                      accessibilityRole="button"
                      accessibilityLabel={`Block ${profile.username}`}
                      hitSlop={8}
                    >
                      <Text style={{ color: theme.colors.danger, fontWeight: '700', fontSize: 13 }}>
                        Block
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <TouchableOpacity
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={{ paddingVertical: 14, alignItems: 'center' }}
                hitSlop={8}
              >
                <Text style={{ color: theme.colors.muted, fontWeight: '700' }}>Close</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function Stat({ label, value, theme }: { label: string; value: string; theme: any }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 17 }}>
        {value}
      </Text>
      <Text style={{ color: theme.colors.muted, fontSize: 11, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 16,
  },
  header: { alignItems: 'center' },
  avatarRing: { borderWidth: 3, borderRadius: 999, padding: 3 },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#fff',
    position: 'absolute',
    right: '36%',
    bottom: 34,
  },
  name: { fontSize: 20, fontWeight: '900', marginTop: 10 },
  stats: { flexDirection: 'row', marginTop: 20 },
  h2h: { marginTop: 18, padding: 14, borderRadius: 16, borderWidth: 1, alignItems: 'center' },
  h2hTitle: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  h2hScore: { fontSize: 24, fontWeight: '900', marginTop: 4 },
  primary: { paddingVertical: 14, borderRadius: 16, alignItems: 'center' },
  primaryLabel: { color: '#fff', fontWeight: '800', fontSize: 15 },
  muted: { paddingVertical: 13, borderRadius: 16, borderWidth: 1, alignItems: 'center' },
  destructive: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 28,
    marginTop: 16,
  },
});
