import { useState } from 'react';
import {
  Modal,
  FlatList,
  Image,
  TouchableOpacity,
  TextInput,
  View,
  StyleSheet,
  Text,
} from 'react-native';
import { AVATAR_MAP } from '@/src/constants/avatars';
import { useTheme } from '@/src/theme/useTheme';

const CUSTOM_TILE = '__custom__';

export function AvatarPickerModal({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected: string;
  onSelect: (avatar: string) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [customEmoji, setCustomEmoji] = useState('');
  const [showEmojiInput, setShowEmojiInput] = useState(false);

  const presetKeys = Object.keys(AVATAR_MAP);
  const isCustomSelected = !!selected && !presetKeys.includes(selected);

  const useCustom = () => {
    const trimmed = customEmoji.trim();
    if (!trimmed) return;
    setShowEmojiInput(false);
    onSelect(trimmed);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <FlatList
            data={[...presetKeys, CUSTOM_TILE]}
            numColumns={3}
            keyExtractor={(a) => a}
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
                      backgroundColor: theme.colors.background,
                      borderColor: isCustomSelected
                        ? theme.colors.primary
                        : 'transparent',
                    },
                  ]}
                >
                  <Text style={styles.customEmoji}>
                    {isCustomSelected ? selected : '➕'}
                  </Text>
                  <Text style={[styles.customLabel, { color: theme.colors.muted }]}>
                    Custom
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => onSelect(item)}
                  style={[
                    styles.avatarWrap,
                    selected === item && {
                      borderColor: theme.colors.primary,
                    },
                  ]}
                >
                  <Image source={AVATAR_MAP[item]} style={styles.avatar} />
                </TouchableOpacity>
              )
            }
          />

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
                  styles.emojiInput,
                  {
                    color: theme.colors.text,
                    borderColor: theme.colors.background,
                  },
                ]}
              />
              <TouchableOpacity
                onPress={useCustom}
                style={[styles.emojiBtn, { backgroundColor: theme.colors.primary }]}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Use</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={[styles.warning, { color: theme.colors.muted }]}>
            Offensive avatars are not allowed — repeated attempts will get your
            account banned.
          </Text>

          <TouchableOpacity onPress={onClose} style={styles.cancel}>
            <Text style={{ color: theme.colors.text, fontWeight: '600' }}>
              Close
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    padding: 20,
    borderRadius: 20,
    width: '85%',
  },
  avatarWrap: {
    borderWidth: 2,
    borderRadius: 40,
    padding: 4,
    borderColor: 'transparent',
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
    marginTop: 16,
    alignItems: 'center',
  },
  emojiInput: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  emojiBtn: {
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  warning: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 14,
    textAlign: 'center',
  },
  cancel: {
    marginTop: 16,
    alignSelf: 'center',
  },
});
