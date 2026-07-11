import type { Href } from 'expo-router';

/**
 * Maps a push-notification `data` payload (see server
 * `notificationService.ts`) to the in-app route that should open when the user
 * taps it. Returns null for unknown/typeless payloads so the caller can fall
 * back to just opening the app on its default screen.
 */
export function notificationRouteFor(
  data: Record<string, any> | undefined | null,
): Href | null {
  const type = data?.type;
  if (typeof type !== 'string') return null;

  switch (type) {
    case 'payout':
      return '/wallet';
    case 'address_warning':
      // USDT address is configured on the Settings screen.
      return '/(tabs)/settings';
    case 'streak_warning':
      return '/streak';
    case 'leaderboard_reminder':
      return '/(tabs)/leaderboard';
    case 'pvp_challenge':
      // No dedicated inbox for challenges — land on home where the
      // "Ready to Play" carousel and Play button live.
      return '/(tabs)/home';
    case 'room_invite':
      return typeof data?.code === 'string'
        ? { pathname: '/room/join', params: { code: data.code } }
        : '/room/join';
    case 'new_challenges':
      return '/challenges';
    case 'tournament_starting':
      return '/tournament';
    case 'friend_request':
    case 'friend_accepted':
      return '/friends';
    default:
      return null;
  }
}
