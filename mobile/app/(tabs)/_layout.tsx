import { Tabs, useRouter } from 'expo-router';
import { Home, Play, Settings, Trophy, User } from 'lucide-react-native';
import { TouchableOpacity } from 'react-native';
import { useTheme } from '../../src/theme/useTheme';

export default function TabsLayout() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: 'transparent',
          height: 72,
          paddingBottom: 12,
        },
        tabBarLabelStyle: {
          fontSize: 12,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Home size={22} color={color} />,
        }}
      />

      <Tabs.Screen
        name="leaderboard"
        options={{
          title: 'Leaderboard',
          tabBarIcon: ({ color }) => <Trophy size={22} color={color} />,
        }}
      />

      {/* PLAY BUTTON (NOT A REAL SCREEN) */}
      <Tabs.Screen
        name="__play__"
        options={{
          title: '',
          tabBarButton: () => (
            <TouchableOpacity
              onPress={() => router.push('/quiz')}
              style={{
                marginTop: -24,
                backgroundColor: theme.colors.primary,
                borderRadius: 999,
                padding: 18,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Play size={28} color="#fff" />
            </TouchableOpacity>
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <User size={22} color={color} />,
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <Settings size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
