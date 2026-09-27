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

it('clears the previous match when a new one is found', () => {
  // A rematch used to open on the questions just played, because setMatched
  // left them in place — and answering them sent the old question ids against
  // the new match, which the server rejects as an invalid question.
  usePvPStore.getState().setMatched({ matchId: 'm1', players, myUserId: 'me' });
  usePvPStore.getState().startMatch(
    [{ id: 'q1', question: 'a?', options: [], difficulty: 'easy', order: 0 }] as any,
    0,
  );
  usePvPStore.getState().updateProgress({ userId: 'me', currentIndex: 1, correct: true, correctIndex: 0 });
  expect(usePvPStore.getState().questions).toHaveLength(1);

  usePvPStore.getState().setMatched({ matchId: 'm2', players, myUserId: 'me' });

  expect(usePvPStore.getState().questions).toEqual([]);
  expect(usePvPStore.getState().currentIndex).toBe(0);
  expect(usePvPStore.getState().lastAnswer).toBeNull();
  expect(usePvPStore.getState().opponentFurthest).toBe(0);
});
