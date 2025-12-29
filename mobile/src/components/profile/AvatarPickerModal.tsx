import {
  Modal,
  FlatList,
  Image,
  TouchableOpacity,
  View,
  StyleSheet,
  Text,
} from 'react-native';
import { AVATAR_MAP } from '@/src/constants/avatars';
import { useTheme } from '@/src/theme/useTheme';

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

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <FlatList
            data={Object.keys(AVATAR_MAP)}
            numColumns={3}
            keyExtractor={(a) => a}
            columnWrapperStyle={{ gap: 16 }}
            contentContainerStyle={{ gap: 16 }}
            renderItem={({ item }) => (
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
            )}
          />

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
  cancel: {
    marginTop: 16,
    alignSelf: 'center',
  },
});
