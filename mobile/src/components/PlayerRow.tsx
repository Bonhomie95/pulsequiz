import { StyleSheet, Text, View } from 'react-native';

import { UserAvatar } from '@/src/components/UserAvatar';
import { useTheme } from '@/src/theme/useTheme';

/** One ranked row: position, avatar, name, score. */
export function PlayerRow({
  rank,
  username,
  avatar,
  score,
  isMe,
  zone,
}: {
  rank: number;
  username: string;
  avatar?: string;
  score: string;
  isMe?: boolean;
  /** Tints the rank for promotion / relegation zones. */
  zone?: 'up' | 'down' | null;
}) {
  const theme = useTheme();
  const rankColor =
    zone === 'up' ? theme.colors.success : zone === 'down' ? theme.colors.danger : theme.colors.muted;
  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: isMe ? theme.colors.primary + '1F' : theme.colors.surface,
          borderColor: isMe ? theme.colors.primary : 'transparent',
        },
      ]}
      accessible
      accessibilityLabel={`Rank ${rank}, ${isMe ? 'you' : username}, ${score}`}
    >
      <Text style={[styles.rank, { color: rankColor }]}>{rank}</Text>
      <UserAvatar avatar={avatar ?? ''} size={34} />
      <Text numberOfLines={1} style={[styles.name, { color: theme.colors.text }]}>
        {isMe ? `${username} (you)` : username}
      </Text>
      <Text style={[styles.score, { color: theme.colors.text }]}>{score}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  rank: { width: 26, textAlign: 'center', fontWeight: '900', fontSize: 15 },
  name: { flex: 1, fontWeight: '700', fontSize: 14 },
  score: { fontWeight: '800', fontSize: 14 },
});
