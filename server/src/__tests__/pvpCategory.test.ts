/**
 * "No questions seeded for category 'Physics'" in production, while the bank
 * held 146 physics questions.
 *
 * The bank stores categories lower case and every lookup matches exactly, but
 * the app sends them title-cased. The queue normalised; the rematch, bot and
 * room paths did not. This pins the normalisation to the model, which is the
 * one place all of them go through.
 */
import PvPMatch from '../models/PvPMatch';
import QuizQuestion from '../models/QuizQuestion';
import User from '../models/User';

async function makeMatch(category: string) {
  const [a, b] = await Promise.all([
    User.create({ email: 'ca@example.com', provider: 'google', providerId: 'ca', username: 'ca', avatar: 'avatar0' }),
    User.create({ email: 'cb@example.com', provider: 'google', providerId: 'cb', username: 'cb', avatar: 'avatar0' }),
  ]);
  const player = (userId: any, name: string) => ({
    userId, usernameSnapshot: name, avatarSnapshot: 'avatar0',
    levelSnapshot: 1, allTimeRankSnapshot: 0,
    currentIndex: 0, furthestIndex: 0, answers: [], answeredMs: 0,
  });
  return PvPMatch.create({
    category,
    mode: 'single',
    state: 'MATCHED',
    wager: 0,
    questionSet: [],
    matchmakingExpiresAt: new Date(Date.now() + 120_000),
    players: [player(a._id, 'ca'), player(b._id, 'cb')],
  });
}

it('stores a title-cased category the way the question bank holds it', async () => {
  const match = await makeMatch('Physics');
  expect(match.category).toBe('physics');

  // And the stored value is one a question lookup actually finds.
  await QuizQuestion.create({
    category: 'physics', difficulty: 'easy',
    question: 'cat q?', options: ['a', 'b', 'c', 'd'], answer: 0,
  });
  expect(await QuizQuestion.countDocuments({ category: match.category })).toBeGreaterThan(0);
});

it('normalises the multi-word categories too', async () => {
  const match = await makeMatch('  Food & Cooking ');
  expect(match.category).toBe('food & cooking');
});
