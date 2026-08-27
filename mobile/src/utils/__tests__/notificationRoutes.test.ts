import { notificationRouteFor } from '../notificationRoutes';

describe('notificationRouteFor', () => {
  it('returns null for missing/typeless payloads', () => {
    expect(notificationRouteFor(undefined)).toBeNull();
    expect(notificationRouteFor(null)).toBeNull();
    expect(notificationRouteFor({})).toBeNull();
    expect(notificationRouteFor({ foo: 'bar' })).toBeNull();
    expect(notificationRouteFor({ type: 'unknown_type' })).toBeNull();
  });

  it('maps known notification types to their routes', () => {
    expect(notificationRouteFor({ type: 'payout' })).toBe('/wallet');
    expect(notificationRouteFor({ type: 'address_warning' })).toBe(
      '/(tabs)/settings',
    );
    expect(notificationRouteFor({ type: 'streak_warning' })).toBe('/streak');
    expect(notificationRouteFor({ type: 'leaderboard_reminder' })).toBe(
      '/(tabs)/leaderboard',
    );
    expect(notificationRouteFor({ type: 'pvp_challenge' })).toBe('/(tabs)/home');
    expect(notificationRouteFor({ type: 'new_challenges' })).toBe('/challenges');
    expect(notificationRouteFor({ type: 'tournament_starting' })).toBe(
      '/tournament',
    );
    expect(notificationRouteFor({ type: 'friend_request' })).toBe('/friends');
    expect(notificationRouteFor({ type: 'friend_accepted' })).toBe('/friends');
  });

  it('carries the room code into the join route when present', () => {
    expect(notificationRouteFor({ type: 'room_invite', code: 'ABC123' })).toEqual(
      { pathname: '/room/join', params: { code: 'ABC123' } },
    );
  });

  it('falls back to the plain join route when no code is given', () => {
    expect(notificationRouteFor({ type: 'room_invite' })).toBe('/room/join');
  });
});
