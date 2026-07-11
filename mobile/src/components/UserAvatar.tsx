import {
  Image,
  Text,
  View,
  StyleSheet,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { AVATAR_MAP } from '@/src/constants/avatars';

/** True when the avatar value is a custom emoji rather than a preset id. */
export function isEmojiAvatar(avatar?: string | null): boolean {
  return !!avatar && !(avatar in AVATAR_MAP) && !/^avatar\d+$/.test(avatar);
}

/**
 * Renders any avatar value: preset ids ("avatar0"…) as images, anything else
 * (custom emoji) as a text glyph. Unknown preset ids fall back to avatar0.
 */
export function UserAvatar({
  avatar,
  size,
  style,
  backgroundColor = 'transparent',
}: {
  avatar?: string | null;
  size: number;
  // Applied to a View (emoji) or an Image (preset), so it must satisfy both
  style?: StyleProp<ViewStyle & ImageStyle>;
  backgroundColor?: string;
}) {
  const round = { width: size, height: size, borderRadius: size / 2 };

  if (isEmojiAvatar(avatar)) {
    return (
      <View style={[styles.emojiWrap, round, { backgroundColor }, style]}>
        <Text style={{ fontSize: size * 0.62, lineHeight: size * 0.8 }}>
          {avatar}
        </Text>
      </View>
    );
  }

  const source =
    AVATAR_MAP[(avatar ?? 'avatar0') as keyof typeof AVATAR_MAP] ??
    AVATAR_MAP.avatar0;

  return <Image source={source} style={[round, style]} />;
}

const styles = StyleSheet.create({
  emojiWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
