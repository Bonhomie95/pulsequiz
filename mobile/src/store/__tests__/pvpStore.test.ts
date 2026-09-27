/**
 * The search screen's unmount cleanup decides whether to wipe the match by
 * reading `status`. That guard is the whole fix for the blank VS screen, so it
 * is worth one check: a found match must not still look like a search.
 */
import { usePvPStore } from '../usePvPStore';

const players = [
  { userId: 'me', username: 'me', avatar: 'avatar0', level: 1, allTimeRank: 0 },
  { userId: 'them', username: 'them', avatar: 'avatar1', level: 1, allTimeRank: 0 },
];

beforeEach(() => usePvPStore.getState().reset());

it('leaves searching once a match is found, so the cleanup does not wipe it', () => {
  usePvPStore.getState().setSearching('math');
  expect(usePvPStore.getState().status).toBe('searching');

  usePvPStore.getState().setMatched({ matchId: 'm1', players, myUserId: 'me' });

  expect(usePvPStore.getState().status).not.toBe('searching');
  expect(usePvPStore.getState().me?.userId).toBe('me');
  expect(usePvPStore.getState().opponent?.userId).toBe('them');
  expect(usePvPStore.getState().matchId).toBe('m1');
});
