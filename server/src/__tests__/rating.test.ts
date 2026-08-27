import mongoose from 'mongoose';
import Progress from '../models/Progress';
import {
  applyMatchRating,
  expectedScore,
  getRating,
  DEFAULT_RATING,
} from '../services/ratingService';

const a = new mongoose.Types.ObjectId().toString();
const b = new mongoose.Types.ObjectId().toString();

async function seed(userId: string, rating: number, games = 30) {
  await Progress.create({
    userId,
    rating,
    pvpWins: games,
    pvpLosses: 0,
    pvpDraws: 0,
  });
}

describe('expectedScore', () => {
  it('is even between equal ratings', () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5);
  });

  it('favours the stronger player', () => {
    expect(expectedScore(1600, 1200)).toBeGreaterThan(0.9);
    expect(expectedScore(1200, 1600)).toBeLessThan(0.1);
  });
});

describe('applyMatchRating', () => {
  it('moves rating toward the winner and away from the loser', async () => {
    await seed(a, 1200);
    await seed(b, 1200);

    const [ra, rb] = await applyMatchRating(a, b, 1);

    expect(ra.delta).toBeGreaterThan(0);
    expect(rb.delta).toBeLessThan(0);
    // Equal K-factors and equal ratings: the exchange is symmetric.
    expect(ra.delta).toBe(-rb.delta);
  });

  it('rewards an upset far more than an expected win', async () => {
    await seed(a, 1000);
    await seed(b, 1600);

    const [underdog] = await applyMatchRating(a, b, 1);

    await Progress.deleteMany({});
    await seed(a, 1600);
    await seed(b, 1000);
    const [favourite] = await applyMatchRating(a, b, 1);

    expect(underdog.delta).toBeGreaterThan(favourite.delta * 3);
  });

  it('barely moves ratings on a draw between equals', async () => {
    await seed(a, 1200);
    await seed(b, 1200);

    const changes = await applyMatchRating(a, b, 0.5);

    expect(Math.abs(changes[0].delta)).toBeLessThanOrEqual(1);
    expect(Math.abs(changes[1].delta)).toBeLessThanOrEqual(1);
  });

  it('moves a provisional account faster than a settled one', async () => {
    await seed(a, 1200, 2);   // provisional
    await seed(b, 1200, 100); // settled

    const [provisional, settled] = await applyMatchRating(a, b, 1);

    expect(Math.abs(provisional.delta)).toBeGreaterThan(Math.abs(settled.delta));
  });

  it('records the win/loss tally', async () => {
    await seed(a, 1200);
    await seed(b, 1200);

    await applyMatchRating(a, b, 1);

    const pa = await Progress.findOne({ userId: a }).lean();
    const pb = await Progress.findOne({ userId: b }).lean();
    expect(pa?.pvpWins).toBe(31);
    expect(pb?.pvpLosses).toBe(1);
  });

  it('never drops a rating below the floor', async () => {
    await seed(a, 610);
    await seed(b, 2400);

    await applyMatchRating(a, b, 0);

    expect(await getRating(a)).toBeGreaterThanOrEqual(600);
  });

  it('starts an unrated player at the default', async () => {
    expect(await getRating(new mongoose.Types.ObjectId().toString())).toBe(
      DEFAULT_RATING,
    );
  });
});
