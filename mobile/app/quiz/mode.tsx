import { useQuizModeStore } from '@/src/store/useQuizModeStore';
import { useRouter } from 'expo-router';
import { Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function QuizModeScreen() {
  const router = useRouter();
  const setMode = useQuizModeStore((s) => s.setMode);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ padding: 20 }}>
        <Text style={{ fontSize: 22, fontWeight: '800' }}>Choose Mode</Text>

        <TouchableOpacity
          onPress={() => {
            setMode('normal');
            router.push('/quiz/categories');
          }}
        >
          <Text>🎯 Normal Quiz</Text>
          <Text>Play solo • Earn points</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            setMode('pvp');
            router.push('/quiz/categories');
          }}
        >
          <Text>⚔️ 1v1 Challenge</Text>
          <Text>Real opponent • Winner takes more</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
