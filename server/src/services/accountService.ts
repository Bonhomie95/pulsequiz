/**
 * Account deletion and data export.
 *
 * Deletion is an *anonymisation*, not a drop. Wallet balances, coin
 * transactions and payout records are financial history: removing the rows
 * would break reconciliation and leave real transfers unattributable. Instead
 * we strip every identifier, tombstone the account, and delete the data that
 * only exists to serve the user.
 *
 * The previous admin-side delete removed the wallet and subscriptions only,
 * leaving Progress, QuizSession, Streak, CoinTransaction, Referral, Payout,
 * UserQuestion, PushToken, Friend and Challenge rows orphaned — and the
 * deleted account still visible on the leaderboard as "Anonymous".
 */
import { Types } from 'mongoose';

import User from '../models/User';
import Progress from '../models/Progress';
import QuizSession from '../models/QuizSession';
import ActiveQuizSession from '../models/ActiveQuizSession';
import UserQuestion from '../models/UserQuestion';
import Streak from '../models/Streak';
import Challenge from '../models/Challenge';
import Friend from '../models/Friend';
import PushToken from '../models/PushToken';
import Referral from '../models/Referral';
import Report from '../models/Report';
import UserActivity from '../models/UserActivity';
import CoinWallet from '../models/CoinWallet';
import CoinTransaction from '../models/CoinTransaction';
import Purchase from '../models/Purchase';
import Payout from '../models/Payout';
import AccumulatedPrize from '../models/AccumulatedPrize';
import Subscription from '../models/Subscription';
import AdReward from '../models/AdReward';
import PvPMatch from '../models/PvPMatch';
import { logger } from '../utils/logger';

export interface DeletionSummary {
  quizHistory: number;
  challenges: number;
  friendships: number;
  devices: number;
  questionHistory: number;
  activity: number;
  retainedForAccounting: string[];
}

export async function anonymiseUser(userId: string): Promise<DeletionSummary> {
  const oid = new Types.ObjectId(userId);
  const stamp = Date.now();

  // 1. Data that exists solely to serve this user — remove it outright.
  const [quizHistory, challenges, friendships, devices, questionHistory, activity] =
    await Promise.all([
      QuizSession.deleteMany({ userId: oid }).then((r) => r.deletedCount ?? 0),
      Challenge.deleteMany({ userId: oid }).then((r) => r.deletedCount ?? 0),
      Friend.deleteMany({ $or: [{ requesterId: oid }, { recipientId: oid }] }).then(
        (r) => r.deletedCount ?? 0,
      ),
      PushToken.deleteMany({ userId: oid }).then((r) => r.deletedCount ?? 0),
      UserQuestion.deleteMany({ userId: oid }).then((r) => r.deletedCount ?? 0),
      UserActivity.deleteMany({ userId: oid }).then((r) => r.deletedCount ?? 0),
    ]);

  await Promise.all([
    ActiveQuizSession.deleteMany({ userId: oid }),
    Progress.deleteOne({ userId: oid }),
    Streak.deleteOne({ userId: oid }),
    AdReward.deleteMany({ userId: oid }),
    // Reports they filed stay (they're about other people's conduct) but are
    // detached from the reporter.
    Report.updateMany({ reporterId: oid }, { $unset: { reporterId: '' } }),
  ]);

  // 2. Strip the username snapshot from historical matches so the account
  //    can't be identified from an opponent's match history.
  await PvPMatch.updateMany(
    { 'players.userId': oid },
    { $set: { 'players.$[p].usernameSnapshot': 'Deleted player', 'players.$[p].avatarSnapshot': 'avatar0' } },
    { arrayFilters: [{ 'p.userId': oid }] },
  );

  // 3. Referrals: keep the edge (it explains coins the referrer was paid) but
  //    it now points at a tombstoned account, which carries no identity.

  // 4. Tombstone the account itself. `email` is immutable in the schema, so
  //    overwrite it with a direct update rather than through the document.
  await User.updateOne(
    { _id: oid },
    {
      $set: {
        email: `deleted_${stamp}_${userId}@deleted.pulsequiz.local`,
        username: null,
        avatar: null,
        providerId: `deleted_${stamp}_${userId}`,
        usdtAddress: undefined,
        usdtType: undefined,
        usdtAddressChangedAt: null,
        withdrawalEnabled: false,
        publicProfile: false,
        deletedAt: new Date(),
        lastSeenAt: null,
      },
      // Invalidates every outstanding token for the account.
      $inc: { tokenVersion: 1 },
    },
    { strict: false },
  );

  logger.info('Account anonymised', { userId, quizHistory, challenges });

  return {
    quizHistory,
    challenges,
    friendships,
    devices,
    questionHistory,
    activity,
    // Named explicitly so the user can be told what is kept and why.
    retainedForAccounting: [
      'coin transaction ledger',
      'store purchase records',
      'prize payout records',
    ],
  };
}

/**
 * Everything we hold about a user, for the GDPR access right.
 */
export async function buildUserExport(userId: string) {
  const oid = new Types.ObjectId(userId);

  const [
    user,
    progress,
    streak,
    wallet,
    transactions,
    quizzes,
    challenges,
    referralsMade,
    referralUsed,
    purchases,
    payouts,
    accumulated,
    subscriptions,
    devices,
    matches,
  ] = await Promise.all([
    User.findById(oid).lean(),
    Progress.findOne({ userId: oid }).lean(),
    Streak.findOne({ userId: oid }).lean(),
    CoinWallet.findOne({ userId: oid }).lean(),
    CoinTransaction.find({ userId: oid }).sort({ createdAt: -1 }).limit(5000).lean(),
    QuizSession.find({ userId: oid }).sort({ createdAt: -1 }).limit(5000).lean(),
    Challenge.find({ userId: oid }).lean(),
    Referral.find({ referrerId: oid }).lean(),
    Referral.findOne({ referredId: oid }).lean(),
    Purchase.find({ userId: oid }).lean(),
    Payout.find({ userId: oid }).lean(),
    AccumulatedPrize.findOne({ userId: oid }).lean(),
    Subscription.find({ userId: oid }).lean(),
    PushToken.find({ userId: oid }).select('-token').lean(),
    PvPMatch.find({ 'players.userId': oid })
      .sort({ createdAt: -1 })
      .limit(500)
      .select('category wager state finishedAt winnerUserId')
      .lean(),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    account: user
      ? {
          id: user._id.toString(),
          email: user.email,
          username: user.username,
          avatar: user.avatar,
          provider: user.provider,
          createdAt: user.createdAt,
          theme: user.theme,
          publicProfile: user.publicProfile,
          usdtType: user.usdtType ?? null,
          usdtAddress: user.usdtAddress ?? null,
        }
      : null,
    progress,
    streak,
    coins: { balance: wallet?.coins ?? 0, transactions },
    quizHistory: quizzes,
    challenges,
    referrals: { made: referralsMade, usedCode: referralUsed },
    purchases,
    subscriptions,
    prizes: { payouts, accumulated },
    devices,
    pvpMatches: matches,
  };
}
