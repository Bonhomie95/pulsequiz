/**
 * PvP skill rating.
 *
 * Standard Elo, with a K-factor that decays as a player's record settles — so
 * a new account converges on its real strength quickly, and an established
 * one doesn't swing wildly on a single result.
 */
import Progress from '../models/Progress';

export const DEFAULT_RATING = 1200;

/** Provisional accounts move faster; settled ones move slowly. */
function kFactor(gamesPlayed: number, rating: number): number {
  if (gamesPlayed < 15) return 40;
  if (rating >= 2100) return 16;
  return 24;
}

/** Expected score for A against B under Elo. */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

export interface RatingChange {
  userId: string;
  before: number;
  after: number;
  delta: number;
}

/**
 * Apply the result of one match.
 * `scoreA` is 1 for an A win, 0.5 for a draw, 0 for an A loss.
 */
export async function applyMatchRating(
  userAId: string,
  userBId: string,
  scoreA: 0 | 0.5 | 1,
): Promise<RatingChange[]> {
  const [a, b] = await Promise.all([
    Progress.findOne({ userId: userAId }).select('rating pvpWins pvpLosses pvpDraws').lean(),
    Progress.findOne({ userId: userBId }).select('rating pvpWins pvpLosses pvpDraws').lean(),
  ]);

  const ratingA = a?.rating ?? DEFAULT_RATING;
  const ratingB = b?.rating ?? DEFAULT_RATING;

  const gamesA = (a?.pvpWins ?? 0) + (a?.pvpLosses ?? 0) + (a?.pvpDraws ?? 0);
  const gamesB = (b?.pvpWins ?? 0) + (b?.pvpLosses ?? 0) + (b?.pvpDraws ?? 0);

  const expectedA = expectedScore(ratingA, ratingB);
  const scoreB = (1 - scoreA) as 0 | 0.5 | 1;

  const deltaA = Math.round(kFactor(gamesA, ratingA) * (scoreA - expectedA));
  const deltaB = Math.round(kFactor(gamesB, ratingB) * (scoreB - (1 - expectedA)));

  // Floor the rating so a bad run can't push someone off the bottom of the
  // matchmaking range entirely.
  const nextA = Math.max(600, ratingA + deltaA);
  const nextB = Math.max(600, ratingB + deltaB);

  const recordField = (score: number) =>
    score === 1 ? 'pvpWins' : score === 0 ? 'pvpLosses' : 'pvpDraws';

  await Promise.all([
    Progress.updateOne(
      { userId: userAId },
      { $set: { rating: nextA }, $inc: { [recordField(scoreA)]: 1 } },
      { upsert: true },
    ),
    Progress.updateOne(
      { userId: userBId },
      { $set: { rating: nextB }, $inc: { [recordField(scoreB)]: 1 } },
      { upsert: true },
    ),
  ]);

  return [
    { userId: userAId, before: ratingA, after: nextA, delta: nextA - ratingA },
    { userId: userBId, before: ratingB, after: nextB, delta: nextB - ratingB },
  ];
}

export async function getRating(userId: string): Promise<number> {
  const p = await Progress.findOne({ userId }).select('rating').lean();
  return p?.rating ?? DEFAULT_RATING;
}
