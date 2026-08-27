import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  Search,
  UserPlus,
  UserMinus,
  Swords,
  Check,
  X,
  Shield,
  ShieldOff,
  Wifi,
  Gamepad2,
  RadioTower,
} from 'lucide-react-native';
import { api } from '@/src/api/api';
import { useTheme } from '@/src/theme/useTheme';
import { Toast } from '@/src/components/Toast';
import { UserAvatar } from '@/src/components/UserAvatar';

type Friend = {
  _id: string;
  username: string;
  avatar?: string;
  isOnline?: boolean;
  isInGame?: boolean;
  isReadyToPlay?: boolean;
};

type SearchUser = {
  _id: string;
  username: string;
  avatar?: string;
  friendStatus: string;
  level?: number;
  allTimeRank?: number;
  totalSessions?: number;
  isOnline?: boolean;
  isInGame?: boolean;
  isReadyToPlay?: boolean;
};

type FriendRequest = {
  _id: string;
  username: string;
  avatar?: string;
  friendId: string;
};
type ActiveTab = 'friends' | 'search' | 'requests';

/* ─── STATUS BADGES ─── */
function StatusBadges({
  user,
  theme,
}: {
  user: Pick<SearchUser, 'isOnline' | 'isInGame' | 'isReadyToPlay'>;
  theme: any;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 4, marginTop: 3 }}>
      {user.isInGame && (
        <View style={[statusBadge.pill, { backgroundColor: '#FF6B0022' }]}>
          <Gamepad2 size={10} color="#FF6B00" />
          <Text style={[statusBadge.label, { color: '#FF6B00' }]}>In Game</Text>
        </View>
      )}
      {!user.isInGame && user.isOnline && (
        <View style={[statusBadge.pill, { backgroundColor: '#22C55E22' }]}>
          <Wifi size={10} color="#22C55E" />
          <Text style={[statusBadge.label, { color: '#22C55E' }]}>Online</Text>
        </View>
      )}
      {user.isReadyToPlay && !user.isInGame && (
        <View style={[statusBadge.pill, { backgroundColor: '#6366F122' }]}>
          <RadioTower size={10} color="#6366F1" />
          <Text style={[statusBadge.label, { color: '#6366F1' }]}>Ready</Text>
        </View>
      )}
    </View>
  );
}

const statusBadge = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  label: { fontSize: 10, fontWeight: '700' },
});

/* ─── PROFILE PREVIEW MODAL ─── */
function ProfilePreview({
  user,
  onClose,
  onAdd,
  onChallenge,
  onUnfriend,
  onBlock,
  theme,
}: {
  user: SearchUser | null;
  onClose: () => void;
  onAdd: (u: SearchUser) => void;
  onChallenge: (u: SearchUser) => void;
  onUnfriend: (u: SearchUser) => void;
  onBlock: (u: SearchUser) => void;
  theme: any;
}) {
  if (!user) return null;
  const alreadyFriend = user.friendStatus === 'accepted';
  const pendingSent = user.friendStatus === 'pending_sent';
  const isBlocked = user.friendStatus === 'blocked';

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      
            accessibilityRole="button"
            accessibilityLabel="View player"
            hitSlop={8}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.modalSheet, { backgroundColor: theme.colors.surface }]}
        
            accessibilityRole="button"
            accessibilityLabel="View player"
            hitSlop={8}>
          <View
            style={[
              styles.sheetHandle,
              { backgroundColor: theme.colors.border },
            ]}
          />

          {/* Avatar */}
          <View style={styles.previewHeader}>
            <View
              style={[
                styles.previewAvatarRing,
                { borderColor: theme.colors.primary },
              ]}
            >
              <UserAvatar avatar={user.avatar} size={74} />
            </View>
            {user.isOnline && (
              <View
                style={[
                  styles.onlineDot,
                  { backgroundColor: user.isInGame ? '#FF6B00' : '#22C55E' },
                ]}
              />
            )}
            <Text style={[styles.previewName, { color: theme.colors.text }]}>
              {user.username}
            </Text>
            <StatusBadges user={user} theme={theme} />
          </View>

          {/* Stats */}
          <View style={styles.previewStats}>
            <View style={styles.previewStat}>
              <Text
                style={[styles.previewStatVal, { color: theme.colors.primary }]}
              >
                {user.level ?? '—'}
              </Text>
              <Text
                style={[styles.previewStatLabel, { color: theme.colors.muted }]}
              >
                Level
              </Text>
            </View>
            <View
              style={[
                styles.previewStatDivider,
                { backgroundColor: theme.colors.border },
              ]}
            />
            <View style={styles.previewStat}>
              <Text style={[styles.previewStatVal, { color: '#FFB800' }]}>
                {user.allTimeRank ? `#${user.allTimeRank}` : '—'}
              </Text>
              <Text
                style={[styles.previewStatLabel, { color: theme.colors.muted }]}
              >
                Rank
              </Text>
            </View>
            <View
              style={[
                styles.previewStatDivider,
                { backgroundColor: theme.colors.border },
              ]}
            />
            <View style={styles.previewStat}>
              <Text
                style={[styles.previewStatVal, { color: theme.colors.text }]}
              >
                {user.totalSessions ?? '—'}
              </Text>
              <Text
                style={[styles.previewStatLabel, { color: theme.colors.muted }]}
              >
                Games
              </Text>
            </View>
          </View>

          {/* Status banners */}
          {alreadyFriend && (
            <View
              style={[
                styles.statusBanner,
                {
                  backgroundColor: theme.colors.success + '22',
                  borderColor: theme.colors.success,
                },
              ]}
            >
              <Check size={14} color={theme.colors.success} />
              <Text
                style={{
                  color: theme.colors.success,
                  fontWeight: '700',
                  fontSize: 13,
                }}
              >
                Already friends
              </Text>
            </View>
          )}
          {pendingSent && (
            <View
              style={[
                styles.statusBanner,
                { backgroundColor: '#FFB80022', borderColor: '#FFB800' },
              ]}
            >
              <Shield size={14} color="#FFB800" />
              <Text
                style={{ color: '#FFB800', fontWeight: '700', fontSize: 13 }}
              >
                Request sent
              </Text>
            </View>
          )}
          {isBlocked && (
            <View
              style={[
                styles.statusBanner,
                { backgroundColor: '#FF5C5C22', borderColor: '#FF5C5C' },
              ]}
            >
              <ShieldOff size={14} color="#FF5C5C" />
              <Text
                style={{ color: '#FF5C5C', fontWeight: '700', fontSize: 13 }}
              >
                Blocked
              </Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.previewActions}>
            {alreadyFriend ? (
              <>
                <TouchableOpacity
                  onPress={() => {
                    onChallenge(user);
                    onClose();
                  }}
                  style={[
                    styles.previewBtn,
                    { backgroundColor: theme.colors.primary },
                  ]}
                
            accessibilityRole="button"
            accessibilityLabel="Challenge"
            hitSlop={8}>
                  <Swords size={18} color="#fff" />
                  <Text style={styles.previewBtnText}>Challenge</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    onUnfriend(user);
                    onClose();
                  }}
                  style={[
                    styles.previewBtn,
                    {
                      backgroundColor: '#FF5C5C22',
                      borderWidth: 1.5,
                      borderColor: '#FF5C5C',
                    },
                  ]}
                
            accessibilityRole="button"
            accessibilityLabel="Unfriend"
            hitSlop={8}>
                  <UserMinus size={16} color="#FF5C5C" />
                  <Text
                    style={{
                      color: '#FF5C5C',
                      fontWeight: '800',
                      fontSize: 15,
                    }}
                  >
                    Unfriend
                  </Text>
                </TouchableOpacity>
              </>
            ) : pendingSent ? (
              <View
                style={[
                  styles.previewBtn,
                  { backgroundColor: theme.colors.border },
                ]}
              >
                <Text style={{ color: theme.colors.muted, fontWeight: '700' }}>
                  Request Pending
                </Text>
              </View>
            ) : isBlocked ? (
              <View
                style={[
                  styles.previewBtn,
                  { backgroundColor: theme.colors.border },
                ]}
              >
                <Text style={{ color: theme.colors.muted, fontWeight: '700' }}>
                  User Blocked
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => {
                  onAdd(user);
                  onClose();
                }}
                style={[
                  styles.previewBtn,
                  { backgroundColor: theme.colors.primary },
                ]}
              
            accessibilityRole="button"
            accessibilityLabel="Add Friend"
            hitSlop={8}>
                <UserPlus size={18} color="#fff" />
                <Text style={styles.previewBtnText}>Add Friend</Text>
              </TouchableOpacity>
            )}

            {/* Block is always available (unless already blocked) */}
            {!isBlocked && (
              <TouchableOpacity
                onPress={() => {
                  onBlock(user);
                  onClose();
                }}
                style={[
                  styles.previewDangerBtn,
                  { borderColor: theme.colors.border },
                ]}
              
            accessibilityRole="button"
            accessibilityLabel="Block User"
            hitSlop={8}>
                <ShieldOff size={14} color={theme.colors.muted} />
                <Text
                  style={{
                    color: theme.colors.muted,
                    fontWeight: '600',
                    fontSize: 13,
                  }}
                >
                  Block User
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={onClose}
              style={[
                styles.previewCancelBtn,
                { borderColor: theme.colors.border },
              ]}
            
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            hitSlop={8}>
              <Text style={{ color: theme.colors.muted, fontWeight: '600' }}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

/* ─── MAIN SCREEN ─── */
export default function FriendsScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<ActiveTab>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [toast, setToast] = useState({
    visible: false,
    message: '',
    type: 'success' as 'success' | 'error',
  });
  const [previewUser, setPreviewUser] = useState<SearchUser | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') =>
    setToast({ visible: true, message, type });

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          setLoadingData(true);
          const [fRes, rRes] = await Promise.all([
            api.get('/friends'),
            api.get('/friends/requests'),
          ]);
          if (!active) return;
          setFriends(fRes.data.friends ?? []);
          setRequests(rRes.data.requests ?? []);
        } catch {
        } finally {
          if (active) setLoadingData(false);
        }
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  // As-you-type search — fires 400ms after user stops typing, min 3 chars
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = searchQuery.trim();
    if (trimmed.length < 3) {
      setSearchResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        setSearching(true);
        const res = await api.get(
          `/friends/search?q=${encodeURIComponent(trimmed)}`,
        );
        setSearchResults(res.data.users ?? []);
      } catch {
        showToast('Search failed', 'error');
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const addFriend = async (u: SearchUser) => {
    try {
      await api.post('/friends/request', { targetUserId: u._id });
      setSearchResults((prev) =>
        prev.map((r) =>
          r._id === u._id ? { ...r, friendStatus: 'pending_sent' } : r,
        ),
      );
      showToast(`Friend request sent to ${u.username}!`);
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Failed', 'error');
    }
  };

  const acceptRequest = async (req: FriendRequest) => {
    try {
      await api.post('/friends/accept', { friendId: req.friendId });
      setRequests((prev) => prev.filter((r) => r.friendId !== req.friendId));
      setFriends((prev) => [
        ...prev,
        { _id: req._id, username: req.username, avatar: req.avatar },
      ]);
      showToast(`You and ${req.username} are now friends!`);
    } catch {
      showToast('Failed to accept', 'error');
    }
  };

  const declineRequest = async (req: FriendRequest) => {
    try {
      await api.post('/friends/decline', { friendId: req.friendId });
      setRequests((prev) => prev.filter((r) => r.friendId !== req.friendId));
      showToast('Request declined');
    } catch {
      showToast('Failed', 'error');
    }
  };

  const unfriendUser = (u: SearchUser | Friend) => {
    Alert.alert('Unfriend', `Remove ${u.username} from your friends?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unfriend',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.post('/friends/unfriend', { userId: u._id });
            setFriends((prev) => prev.filter((f) => f._id !== u._id));
            setSearchResults((prev) =>
              prev.map((r) =>
                r._id === u._id ? { ...r, friendStatus: 'none' } : r,
              ),
            );
            showToast(`${u.username} removed from friends`);
          } catch {
            showToast('Failed to unfriend', 'error');
          }
        },
      },
    ]);
  };

  const blockUser = (u: SearchUser | Friend) => {
    Alert.alert(
      'Block User',
      `Block ${u.username}? They won't be able to send you friend requests or appear in your searches.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post('/friends/block', { userId: u._id });
              setFriends((prev) => prev.filter((f) => f._id !== u._id));
              setSearchResults((prev) =>
                prev.map((r) =>
                  r._id === u._id ? { ...r, friendStatus: 'blocked' } : r,
                ),
              );
              showToast(`${u.username} has been blocked`);
            } catch {
              showToast('Failed to block user', 'error');
            }
          },
        },
      ],
    );
  };

  const inviteToRoom = (userId: string) =>
    router.push({
      pathname: '/room/create',
      params: { invite: userId },
    } as any);

  const challengeUser = (u: SearchUser | Friend) => inviteToRoom(u._id);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView
      edges={['top']}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <Toast
        {...toast}
        onHide={() => setToast((t) => ({ ...t, visible: false }))}
      />

      <ProfilePreview
        user={previewUser}
        onClose={() => setPreviewUser(null)}
        onAdd={addFriend}
        onChallenge={challengeUser}
        onUnfriend={unfriendUser}
        onBlock={blockUser}
        theme={theme}
      />

      {/* HEADER */}
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}
            accessibilityRole="button"
            hitSlop={8}
            accessibilityLabel="Go back">
          <ChevronLeft size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
          Friends
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* TABS */}
      <View
        style={[
          styles.tabBar,
          {
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        {(
          [
            {
              key: 'friends',
              label: `👥 Friends${friends.length > 0 ? ` (${friends.length})` : ''}`,
            },
            { key: 'search', label: '🔍 Find' },
            {
              key: 'requests',
              label: `📬 Requests${requests.length > 0 ? ` (${requests.length})` : ''}`,
            },
          ] as const
        ).map((t) => (
          <TouchableOpacity
            key={t.key}
            accessibilityRole="tab"
            // The visible label leads with an emoji, which a screen reader
            // announces literally; strip it for the spoken label.
            accessibilityLabel={t.label.replace(/^\P{L}+/u, '').trim()}
            accessibilityState={{ selected: activeTab === t.key }}
            onPress={() => setActiveTab(t.key as ActiveTab)}
            style={[
              styles.tab,
              activeTab === t.key && {
                borderBottomColor: theme.colors.primary,
                borderBottomWidth: 2.5,
              },
            ]}
            hitSlop={8}>
            <Text
              style={[
                styles.tabLabel,
                {
                  color:
                    activeTab === t.key
                      ? theme.colors.primary
                      : theme.colors.muted,
                },
              ]}
            >
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── FRIENDS TAB ── */}
      {activeTab === 'friends' && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
          style={{ flex: 1 }}
        >
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
          <View
            style={[
              styles.roomSection,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <Text style={[styles.roomTitle, { color: theme.colors.text }]}>
              ⚡ Quick Play
            </Text>
            <Text style={[styles.roomSub, { color: theme.colors.muted }]}>
              No friend request needed — share a room code
            </Text>
            <View style={styles.roomBtns}>
              <TouchableOpacity
                onPress={() => router.push('/room/create' as any)}
                style={[
                  styles.roomBtn,
                  { backgroundColor: theme.colors.primary },
                ]}
              
            accessibilityRole="button"
            accessibilityLabel="Create Room"
            hitSlop={8}>
                <Text style={styles.roomBtnText}>Create Room</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push('/room/join' as any)}
                style={[
                  styles.roomBtnOutline,
                  { borderColor: theme.colors.primary },
                ]}
              
            accessibilityRole="button"
            accessibilityLabel="Join Room"
            hitSlop={8}>
                <Text
                  style={[
                    styles.roomBtnOutlineText,
                    { color: theme.colors.primary },
                  ]}
                >
                  Join Room
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {loadingData ? (
            <ActivityIndicator
              color={theme.colors.primary}
              style={{ marginTop: 40 }}
            />
          ) : friends.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 48, marginBottom: 12 }}>👥</Text>
              <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
                No friends yet
              </Text>
              <Text style={[styles.emptySub, { color: theme.colors.muted }]}>
                Search for players and send them a request
              </Text>
              <TouchableOpacity
                onPress={() => setActiveTab('search')}
                style={[
                  styles.emptyBtn,
                  { backgroundColor: theme.colors.primary },
                ]}
              
            accessibilityRole="button"
            accessibilityLabel="Find Friends"
            hitSlop={8}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>
                  Find Friends
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            friends.map((f) => {
              return (
                <TouchableOpacity
                  key={f._id}
                  onPress={() =>
                    setPreviewUser({ ...f, friendStatus: 'accepted' })
                  }
                  style={[
                    styles.friendRow,
                    { backgroundColor: theme.colors.surface },
                  ]}
                  activeOpacity={0.8}
                
            accessibilityRole="button"
            accessibilityLabel="Challenge"
            hitSlop={8}>
                  <View>
                    <View
                      style={[
                        styles.friendAvatar,
                        { backgroundColor: theme.colors.primary + '22' },
                      ]}
                    >
                      <UserAvatar avatar={f.avatar} size={36} />
                    </View>
                    {f.isOnline && (
                      <View
                        style={[
                          styles.onlineDotSmall,
                          {
                            backgroundColor: f.isInGame ? '#FF6B00' : '#22C55E',
                          },
                        ]}
                      />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.friendName, { color: theme.colors.text }]}
                    >
                      {f.username}
                    </Text>
                    <StatusBadges user={f} theme={theme} />
                  </View>
                  <TouchableOpacity
                    onPress={() => inviteToRoom(f._id)}
                    style={[
                      styles.challengeBtn,
                      {
                        backgroundColor: f.isInGame
                          ? theme.colors.border
                          : theme.colors.primary,
                        opacity: f.isInGame ? 0.5 : 1,
                      },
                    ]}
                    disabled={f.isInGame}
                  
            accessibilityRole="button"
            accessibilityLabel="Challenge"
            hitSlop={8}>
                    <Swords size={14} color="#fff" />
                    <Text style={styles.challengeBtnText}>Challenge</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* ── SEARCH TAB ── */}
      {activeTab === 'search' && (
        <View style={{ flex: 1 }}>
          <View
            style={[
              styles.searchBar,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Search size={18} color={theme.colors.muted} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Type 3+ letters to search…"
              placeholderTextColor={theme.colors.muted}
              style={[styles.searchInput, { color: theme.colors.text }]}
              returnKeyType="search"
              autoFocus
            />
            {searching ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : searchQuery.length > 0 ? (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                hitSlop={8}
              >
                <X size={16} color={theme.colors.muted} />
              </TouchableOpacity>
            ) : null}
          </View>

          {searchQuery.trim().length > 0 && searchQuery.trim().length < 3 && (
            <Text
              style={{
                color: theme.colors.muted,
                textAlign: 'center',
                marginTop: 8,
                fontSize: 13,
              }}
            >
              Keep typing… ({3 - searchQuery.trim().length} more character
              {3 - searchQuery.trim().length !== 1 ? 's' : ''})
            </Text>
          )}

          <FlatList
            data={searchResults}
            keyExtractor={(u) => u._id}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            ListEmptyComponent={
              searchQuery.trim().length >= 3 && !searching ? (
                <View style={styles.emptyState}>
                  <Text style={{ fontSize: 40, marginBottom: 8 }}>🔍</Text>
                  <Text
                    style={[styles.emptyTitle, { color: theme.colors.text }]}
                  >
                    No results
                  </Text>
                  <Text
                    style={[styles.emptySub, { color: theme.colors.muted }]}
                  >
                    Try a different username
                  </Text>
                </View>
              ) : null
            }
            renderItem={({ item: u }) => {
              const isFriend = u.friendStatus === 'accepted';
              const isPending = u.friendStatus === 'pending_sent';
              const isBlocked = u.friendStatus === 'blocked';
              return (
                <TouchableOpacity
                  onPress={() => !isBlocked && setPreviewUser(u)}
                  style={[
                    styles.searchResult,
                    {
                      backgroundColor: theme.colors.surface,
                      opacity: isBlocked ? 0.5 : 1,
                    },
                  ]}
                  activeOpacity={0.8}
                  disabled={isBlocked}
                
            accessibilityRole="button"
            accessibilityLabel="Blocked"
            hitSlop={8}>
                  <View>
                    <View
                      style={[
                        styles.friendAvatar,
                        { backgroundColor: theme.colors.primary + '22' },
                      ]}
                    >
                      <UserAvatar avatar={u.avatar} size={36} />
                    </View>
                    {u.isOnline && !isBlocked && (
                      <View
                        style={[
                          styles.onlineDotSmall,
                          {
                            backgroundColor: u.isInGame ? '#FF6B00' : '#22C55E',
                          },
                        ]}
                      />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.friendName, { color: theme.colors.text }]}
                    >
                      {u.username}
                    </Text>
                    {!isBlocked && <StatusBadges user={u} theme={theme} />}
                    {isBlocked && (
                      <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                        Blocked
                      </Text>
                    )}
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor: isFriend
                          ? theme.colors.success + '22'
                          : isPending
                            ? '#FFB80022'
                            : isBlocked
                              ? '#FF5C5C22'
                              : theme.colors.primary + '22',
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: isFriend
                          ? theme.colors.success
                          : isPending
                            ? '#FFB800'
                            : isBlocked
                              ? '#FF5C5C'
                              : theme.colors.primary,
                        fontSize: 11,
                        fontWeight: '700',
                      }}
                    >
                      {isFriend
                        ? '✓ Friends'
                        : isPending
                          ? 'Pending'
                          : isBlocked
                            ? 'Blocked'
                            : 'Add →'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      {/* ── REQUESTS TAB ── */}
      {activeTab === 'requests' && (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
          {requests.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 48, marginBottom: 12 }}>📬</Text>
              <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
                No pending requests
              </Text>
              <Text style={[styles.emptySub, { color: theme.colors.muted }]}>
                When someone adds you, it will appear here
              </Text>
            </View>
          ) : (
            requests.map((req) => {
              return (
                <View
                  key={req.friendId}
                  style={[
                    styles.requestRow,
                    { backgroundColor: theme.colors.surface },
                  ]}
                >
                  <View
                    style={[
                      styles.friendAvatar,
                      { backgroundColor: theme.colors.primary + '22' },
                    ]}
                  >
                    <UserAvatar avatar={req.avatar} size={36} />
                  </View>
                  <Text
                    style={[
                      styles.friendName,
                      { color: theme.colors.text, flex: 1 },
                    ]}
                  >
                    {req.username}
                  </Text>
                  <TouchableOpacity
                    onPress={() => declineRequest(req)}
                    accessibilityRole="button"
                    accessibilityLabel="Decline friend request"
                    style={styles.declineBtn}
            hitSlop={8}>
                    <X size={16} color="#FF5C5C" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => acceptRequest(req)}
                    style={[
                      styles.acceptBtn,
                      { backgroundColor: theme.colors.primary },
                    ]}
                  
            accessibilityRole="button"
            hitSlop={8}
            accessibilityLabel="Confirm">
                    <Check size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
  },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabLabel: { fontSize: 12, fontWeight: '700' },
  roomSection: { borderRadius: 18, padding: 16, marginBottom: 20 },
  roomTitle: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  roomSub: { fontSize: 12, marginBottom: 14 },
  roomBtns: { flexDirection: 'row', gap: 10 },
  roomBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  roomBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  roomBtnOutline: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  roomBtnOutlineText: { fontWeight: '800', fontSize: 14 },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  emptySub: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  emptyBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 16 },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  friendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  friendName: { fontSize: 15, fontWeight: '700' },
  challengeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  challengeBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    margin: 16,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15 },
  searchResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 14,
  },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 14,
  },
  acceptBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  declineBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FF5C5C22',
  },
  onlineDotSmall: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'white',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  previewHeader: { alignItems: 'center', marginBottom: 24 },
  previewAvatarRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    overflow: 'hidden',
    marginBottom: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewAvatarImg: { width: '100%', height: '100%' },
  onlineDot: {
    position: 'absolute',
    bottom: 14,
    right: '35%',
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: 'white',
  },
  previewName: { fontSize: 22, fontWeight: '900', marginBottom: 6 },
  previewStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 20,
  },
  previewStat: { alignItems: 'center', flex: 1 },
  previewStatVal: { fontSize: 24, fontWeight: '900' },
  previewStatLabel: { fontSize: 11, marginTop: 2 },
  previewStatDivider: { width: 1, height: 36 },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 16,
  },
  previewActions: { gap: 10 },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 18,
  },
  previewBtnText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  previewDangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  previewCancelBtn: {
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: 'center',
    borderWidth: 1.5,
  },
});
