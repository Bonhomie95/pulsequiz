import { useEffect, useRef } from 'react';
import { View, Text, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

import { usePvPStore } from '@/src/store/usePvPStore';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useTheme } from '@/src/theme/useTheme';
import { soundManager } from '@/src/audio/SoundManager';
import { showInterstitialAd } from '@/src/ads/admob';

export default function PvPResultScreen() {
  const theme = useTheme();
  const router = useRouter();
  const playedRef = useRef(false);

  const { winnerUserId, me, opponent } = usePvPStore();
  const myUserId = useAuthStore.getState().user?.id;

  const isWinner = winnerUserId === myUserId;

  /* ---------------- ONE-TIME EFFECT ---------------- */
  useEffect(() => {
    if (playedRef.current) return;
    playedRef.current = true;

    (async () => {
      // 🔊 Sound + Haptics
      if (isWinner) {
        soundManager.play('victory');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        soundManager.play('fail');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      // 📺 Ads logic (same as normal quiz)
      await showInterstitialAd();
    })();

    return () => {
      soundManager.stopEffects();
    };
  }, []);

  /* ---------------- UI ---------------- */
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          paddingBottom: 40,
          flexGrow: 1,
          justifyContent: 'center',
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* RESULT HEADER */}
        <Text
          style={{
            fontSize: 34,
            fontWeight: '900',
            color: isWinner ? theme.colors.primary : theme.colors.text,
            textAlign: 'center',
          }}
        >
          {isWinner ? '🏆 You Win!' : '💀 You Lost'}
        </Text>

        <Text
          style={{
            marginTop: 6,
            textAlign: 'center',
            color: theme.colors.muted,
            fontSize: 15,
          }}
        >
          {isWinner ? 'You outplayed your opponent' : 'Better luck next time'}
        </Text>

        {/* PLAYER CARDS */}
        <View
          style={{
            marginTop: 28,
            padding: 18,
            borderRadius: 20,
            backgroundColor: theme.colors.surface,
          }}
        >
          <Row label="You" value={me?.username ?? 'You'} />
          <Row label="Opponent" value={opponent?.username ?? 'Opponent'} />
        </View>

        {/* REWARDS */}
        <View
          style={{
            marginTop: 24,
            padding: 20,
            borderRadius: 22,
            backgroundColor: theme.colors.surface,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: theme.colors.muted }}>Rewards Earned</Text>

          <Text
            style={{
              fontSize: 36,
              fontWeight: '900',
              color: theme.colors.coin,
              marginTop: 8,
            }}
          >
            {isWinner ? '+50 pts' : '+0 pts'}
          </Text>

          <Text
            style={{
              marginTop: 6,
              fontSize: 16,
              color: theme.colors.coin,
            }}
          >
            {isWinner ? '+50 coins' : '+20 coins'}
          </Text>
        </View>

        {/* ACTIONS */}
        <View style={{ marginTop: 32, gap: 14 }}>
          {/* PLAY AGAIN */}
          <View
            onTouchEnd={() => {
              usePvPStore.getState().reset();
              router.replace('/quiz/mode');
            }}
            style={{
              backgroundColor: theme.colors.primary,
              paddingVertical: 16,
              borderRadius: 18,
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                color: '#fff',
                fontWeight: '900',
                fontSize: 16,
              }}
            >
              ⚔️ Play Another Match
            </Text>
          </View>

          {/* HOME */}
          <View
            onTouchEnd={() => {
              usePvPStore.getState().reset();
              router.replace('/(tabs)/home');
            }}
            style={{
              backgroundColor: theme.colors.surface,
              paddingVertical: 16,
              borderRadius: 18,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text
              style={{
                color: theme.colors.text,
                fontWeight: '800',
                fontSize: 15,
              }}
            >
              🏠 Back to Home
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/* ---------------- SMALL COMPONENT ---------------- */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginVertical: 6,
      }}
    >
      <Text style={{ opacity: 0.6 }}>{label}</Text>
      <Text style={{ fontWeight: '700' }}>{value}</Text>
    </View>
  );
}
