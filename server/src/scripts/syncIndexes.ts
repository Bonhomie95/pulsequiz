/**
 * Build the indexes the code now depends on, against a live database.
 *
 * Run this BEFORE deploying the new server. Several of the new indexes are
 * load-bearing for correctness, not just speed:
 *
 *   • QuizSession {userId, sessionId} unique — makes quiz-finish and PvP
 *     settlement idempotent.
 *   • AdReward {transactionId} unique — makes the AdMob callback idempotent.
 *   • User {provider, providerId} unique — one account per provider identity.
 *   • User username_ci — case-insensitive uniqueness, index-backed.
 *
 * A unique index will FAIL to build if the collection already holds
 * duplicates. That is the point: it surfaces data that needs cleaning rather
 * than silently accepting it. Run with `--report` first to see what would
 * collide without changing anything.
 *
 *   npm run sync-indexes -- --report
 *   npm run sync-indexes
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import User from '../models/User';
import QuizSession from '../models/QuizSession';
import Progress from '../models/Progress';
import PvPMatch from '../models/PvPMatch';
import UserQuestion from '../models/UserQuestion';
import CoinTransaction from '../models/CoinTransaction';
import CoinWallet from '../models/CoinWallet';
import UserActivity from '../models/UserActivity';
import Streak from '../models/Streak';
import Payout from '../models/Payout';
import Purchase from '../models/Purchase';
import Subscription from '../models/Subscription';
import Challenge from '../models/Challenge';
import Referral from '../models/Referral';
import Room from '../models/Room';
import Tournament from '../models/Tournament';
import LeaderboardSnapshot from '../models/LeaderboardSnapshot';
import AdReward from '../models/AdReward';
import AdminAuditLog from '../models/AdminAuditLog';
import JobLock from '../models/JobLock';
import PushToken from '../models/PushToken';
import Friend from '../models/Friend';
import FlaggedAccount from '../models/FlaggedAccount';
import Report from '../models/Report';
import PrizePool from '../models/PrizePool';
import AccumulatedPrize from '../models/AccumulatedPrize';
import ActiveQuizSession from '../models/ActiveQuizSession';
import QuizQuestion from '../models/QuizQuestion';
import Admin from '../models/Admin';
import AppSettings from '../models/AppSettings';

const MODELS: mongoose.Model<any>[] = [
  User, QuizSession, Progress, PvPMatch, UserQuestion, CoinTransaction,
  CoinWallet, UserActivity, Streak, Payout, Purchase, Subscription, Challenge,
  Referral, Room, Tournament, LeaderboardSnapshot, AdReward, AdminAuditLog,
  JobLock, PushToken, Friend, FlaggedAccount, Report, PrizePool,
  AccumulatedPrize, ActiveQuizSession, QuizQuestion, Admin, AppSettings,
];

/** Duplicate checks for the unique indexes that could fail to build. */
async function findBlockers() {
  const problems: string[] = [];

  const dupSessions = await QuizSession.aggregate([
    { $group: { _id: { userId: '$userId', sessionId: '$sessionId' }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $limit: 20 },
  ]);
  if (dupSessions.length) {
    problems.push(
      `QuizSession has ${dupSessions.length}+ duplicate (userId, sessionId) pairs. ` +
        'Deduplicate before the unique index can build.',
    );
  }

  const dupProviders = await User.aggregate([
    { $match: { deletedAt: null } },
    { $group: { _id: { provider: '$provider', providerId: '$providerId' }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $limit: 20 },
  ]);
  if (dupProviders.length) {
    problems.push(`User has ${dupProviders.length}+ duplicate (provider, providerId) pairs.`);
  }

  const dupUsernames = await User.aggregate([
    { $match: { username: { $ne: null } } },
    { $group: { _id: { $toLower: '$username' }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $limit: 20 },
  ]);
  if (dupUsernames.length) {
    problems.push(
      `${dupUsernames.length}+ usernames collide case-insensitively ` +
        `(e.g. "${dupUsernames[0]._id}"). Rename one of each pair first.`,
    );
  }

  return problems;
}

async function main() {
  const reportOnly = process.argv.includes('--report');

  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to ${mongoose.connection.name}`);

  const blockers = await findBlockers();
  if (blockers.length) {
    console.error('\n⚠️  Data problems that will block a unique index build:\n');
    for (const b of blockers) console.error(`  • ${b}`);
    console.error('');
    if (!reportOnly) {
      console.error('Refusing to continue. Fix these, then re-run.');
      await mongoose.disconnect();
      process.exit(1);
    }
  } else {
    console.log('No duplicate-key blockers found.');
  }

  if (reportOnly) {
    console.log('\n--report: no changes made.');
    await mongoose.disconnect();
    return;
  }

  let failures = 0;
  for (const model of MODELS) {
    try {
      // syncIndexes drops indexes the schema no longer declares and creates the
      // new ones. On a large collection this takes a while — run it in a
      // maintenance window or on a rolling secondary.
      const dropped = await model.syncIndexes();
      console.log(
        `  ✓ ${model.modelName}${dropped.length ? ` (dropped: ${dropped.join(', ')})` : ''}`,
      );
    } catch (err) {
      failures += 1;
      console.error(`  ✗ ${model.modelName}: ${(err as Error).message}`);
    }
  }

  await mongoose.disconnect();

  if (failures) {
    console.error(`\n${failures} model(s) failed to sync.`);
    process.exit(1);
  }
  console.log('\nAll indexes synced.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
