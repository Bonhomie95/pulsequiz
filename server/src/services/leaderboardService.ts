import { Types } from 'mongoose';

import QuizSession from '../models/QuizSession';
import Progress from '../models/Progress';
import User from '../models/User';
import LeaderboardSnapshot from '../models/LeaderboardSnapshot';
import { periodContaining, type Period } from '../utils/dateRanges';
import { logger } from '../utils/logger';

export type LeaderboardType = 'weekly' | 'monthly' | 'all';

const TOP_N = 100;

export interface LeaderboardEntry {
  userId: string;
  username: string;
  avatar: string;
  points: number;
  rank: number;
}

/**
 * Compute a leaderboard, persist the snapshot, and return the ranked entries.
 *
 * `period` is optional and only meaningful for weekly/monthly. Pass it
 * explicitly from the payout cron, which must rank the period that just ended
 * rather than the one currently in progress.
 */
export async function buildLeaderboard(
  type: LeaderboardType,
  period?: Period,
): Promise<LeaderboardEntry[]> {
  let rows: { userId: string; points: number }[];
  let snapshotLabel: string | null = null;

  if (type === 'all') {
    const all = await Progress.find({ points: { $gt: 0 } })
      .sort({ points: -1 })
      .limit(TOP_N)
      .lean();

    rows = all.map((p) => ({ userId: p.userId.toString(), points: p.points }));
  } else {
    const range = period ?? periodContaining(type);
    snapshotLabel = range.label;

    const agg = await QuizSession.aggregate<{ _id: any; points: number }>([
      { $match: { createdAt: { $gte: range.start, $lte: range.end } } },
      { $group: { _id: '$userId', points: { $sum: '$totalPoints' } } },
      { $match: { points: { $gt: 0 } } },
      { $sort: { points: -1 } },
      { $limit: TOP_N },
    ]);

    rows = agg.map((r) => ({ userId: r._id.toString(), points: r.points }));
  }

  // Hydrate usernames and avatars in a single query. Banned and deleted
  // accounts are excluded from the ranking entirely — a banned account holding
  // a paid rank would block a legitimate player from the prize.
  const userIds = rows.map((r) => r.userId);
  const users = await User.find({
    _id: { $in: userIds },
    isBanned: { $ne: true },
    deletedAt: null,
  })
    .select('username avatar')
    .lean();
  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  const data: LeaderboardEntry[] = rows
    .filter((r) => userMap.has(r.userId))
    .map((r, index) => {
      const u = userMap.get(r.userId)!;
      return {
        userId: r.userId,
        username: u.username ?? 'Anonymous',
        avatar: u.avatar ?? '',
        points: r.points,
        rank: index + 1,
      };
    });

  try {
    await LeaderboardSnapshot.updateOne(
      { type },
      {
        $set: {
          data,
          generatedAt: new Date(),
          ...(snapshotLabel ? { periodLabel: snapshotLabel } : {}),
        },
      },
      { upsert: true },
    );
  } catch (err) {
    logger.error('Failed to persist leaderboard snapshot', err, { type });
  }

  return data;
}

/**
 * Where a specific user stands.
 *
 * The stored snapshot only holds the top 100, so a player at #412 used to get
 * no feedback at all. This fills that in — but it has to be cheap, because the
 * home screen calls it on every load for the large majority of players who are
 * outside the top 100.
 *
 * So: the player's own total is one index-backed read, and everything else
 * (their rank if they're on the board, and the points cutoffs for the paid
 * tier and the visible board) comes from the snapshot document the cron
 * already maintains. No full-period scan on the request path.
 */
export interface UserStanding {
  /** Exact rank when the player is on the stored board, otherwise null. */
  rank: number | null;
  points: number;
  /** Points still needed to reach the lowest paying rank; 0 if already inside. */
  pointsToPaidTier: number | null;
  /** Points needed to appear on the visible board at all. */
  pointsToBoard: number | null;
  /** True when the player is below the last stored rank. */
  outsideBoard: boolean;
}

export async function getUserStanding(
  userId: string,
  type: LeaderboardType,
  paidRanks?: number | null,
): Promise<UserStanding> {
  const empty: UserStanding = {
    rank: null,
    points: 0,
    pointsToPaidTier: null,
    pointsToBoard: null,
    outsideBoard: false,
  };

  // ── The player's own total ────────────────────────────────────────────────
  let points: number;

  if (type === 'all') {
    const mine = await Progress.findOne({ userId }).select('points').lean();
    points = mine?.points ?? 0;
  } else {
    const range = periodContaining(type);
    // Index-backed on {userId, createdAt} — touches only this player's rows.
    const agg = await QuizSession.aggregate<{ points: number }>([
      {
        $match: {
          userId: Types.ObjectId.createFromHexString(userId),
          createdAt: { $gte: range.start, $lte: range.end },
        },
      },
      { $group: { _id: null, points: { $sum: '$totalPoints' } } },
    ]);
    points = agg[0]?.points ?? 0;
  }

  if (points <= 0) return empty;

  // ── Position, read from the snapshot ──────────────────────────────────────
  const snapshot = await LeaderboardSnapshot.findOne({ type })
    .select('data')
    .lean();
  const board = (snapshot?.data ?? []) as { userId: string; points: number }[];

  const onBoard = board.findIndex((e) => e.userId === userId);
  const rank = onBoard >= 0 ? onBoard + 1 : null;

  // Below the last stored entry (or the board isn't full, in which case any
  // score would have made it and the player simply hasn't been ranked yet).
  const lastEntry = board[board.length - 1];
  const outsideBoard = rank === null && board.length >= TOP_N;

  const pointsToBoard =
    rank !== null || !lastEntry || board.length < TOP_N
      ? 0
      : Math.max(1, lastEntry.points - points + 1);

  let pointsToPaidTier: number | null = null;
  if (paidRanks && paidRanks > 0) {
    if (rank !== null && rank <= paidRanks) {
      pointsToPaidTier = 0;
    } else {
      const cutoffEntry = board[paidRanks - 1];
      // Fewer ranked players than paid ranks — anyone scoring qualifies.
      pointsToPaidTier = cutoffEntry
        ? Math.max(1, cutoffEntry.points - points + 1)
        : 0;
    }
  }

  return { rank, points, pointsToPaidTier, pointsToBoard, outsideBoard };
}

/** When the snapshots were last rebuilt, so an idle minute can be skipped. */
let lastRebuildAt: Date | null = null;

export interface RebuildResult {
  rebuilt: boolean;
  reason?: 'no_activity';
  newSessions?: number;
}

/**
 * Rebuild all three snapshots.
 *
 * This is scheduled work, not request work. It used to run synchronously on
 * every quiz completion — three full-collection aggregations per finish, with a
 * cost that grew linearly with total sessions ever played.
 *
 * It runs every minute, so on a quiet server most ticks have nothing to do.
 * Two index-backed counts are far cheaper than three aggregations, and the
 * boards can only move when a session was recorded (weekly/monthly) or a
 * Progress row changed (all-time, which challenge rewards also touch).
 */
export async function rebuildLeaderboardSnapshots(
  options: { force?: boolean } = {},
): Promise<RebuildResult> {
  const since = lastRebuildAt;
  const startedAt = new Date();

  if (!options.force && since) {
    const [newSessions, progressChanges] = await Promise.all([
      QuizSession.countDocuments({ createdAt: { $gt: since } }),
      Progress.countDocuments({ updatedAt: { $gt: since } }),
    ]);

    if (newSessions === 0 && progressChanges === 0) {
      return { rebuilt: false, reason: 'no_activity' };
    }
  }

  await buildLeaderboard('weekly');
  await buildLeaderboard('monthly');
  await buildLeaderboard('all');

  lastRebuildAt = startedAt;
  return { rebuilt: true };
}
