import QuizSession from '../models/QuizSession';
import Progress from '../models/Progress';
import User from '../models/User';
import LeaderboardSnapshot from '../models/LeaderboardSnapshot';
import { getWeeklyRange, getMonthlyRange } from '../utils/dateRanges';

type LeaderboardType = 'weekly' | 'monthly' | 'all';

export async function buildLeaderboard(type: LeaderboardType, limit = 50) {
  let match: any = {};

  if (type === 'weekly') {
    const { start, end } = getWeeklyRange();
    match.createdAt = { $gte: start, $lte: end };
  }

  if (type === 'monthly') {
    const { start, end } = getMonthlyRange();
    match.createdAt = { $gte: start, $lte: end };
  }

  // Aggregate quiz points
  const aggregated =
    type === 'all'
      ? await Progress.aggregate([
          { $sort: { points: -1 } },
          { $limit: limit },
          {
            $lookup: {
              from: 'users',
              localField: 'userId',
              foreignField: '_id',
              as: 'user',
            },
          },
          { $unwind: '$user' },
          {
            $project: {
              userId: { $toString: '$user._id' },
              username: '$user.username',
              avatar: '$user.avatar',
              points: '$points',
            },
          },
        ])
      : await QuizSession.aggregate([
          { $match: match },
          {
            $group: {
              _id: '$userId',
              points: { $sum: '$totalPoints' },
            },
          },
          { $sort: { points: -1 } },
          { $limit: limit },
          {
            $lookup: {
              from: 'users',
              localField: '_id',
              foreignField: '_id',
              as: 'user',
            },
          },
          { $unwind: '$user' },
          {
            $project: {
              userId: { $toString: '$user._id' },
              username: '$user.username',
              avatar: '$user.avatar',
              points: 1,
            },
          },
        ]);

  // Save snapshot (cache)
  await LeaderboardSnapshot.updateOne(
    { type },
    {
      $set: {
        type,
        data: aggregated,
        generatedAt: new Date(),
      },
    },
    { upsert: true }
  );

  return aggregated;
}
