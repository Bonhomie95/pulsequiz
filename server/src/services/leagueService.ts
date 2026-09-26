/**
 * Weekly leagues.
 *
 * Every player who earns XP in a week is placed in a group of up to 30 people
 * in their tier. At the end of the ISO week (Monday 00:00 UTC) the top of each
 * group moves up a tier, the bottom moves down, and the top three get coins.
 * Everyone has a race they can realistically win, which a single global board
 * of thousands can't offer.
 *
 * Rewards are coins only — never real money — so leagues need no prize rules.
 */
import { Types } from 'mongoose';

import { LeagueGroup, LeagueMember, type LeagueOutcome } from '../models/League';
import User from '../models/User';
import { creditCoins } from './coinService';
import { periodContaining } from '../utils/dateRanges';
import { logger } from '../utils/logger';

export const LEAGUE_TIERS = [
  'Bronze',
  'Silver',
  'Gold',
  'Platinum',
  'Diamond',
  'Master',
  'Legend',
] as const;

export const GROUP_SIZE = 30;
const TOP_TIER = LEAGUE_TIERS.length - 1;

/** Coins for 1st, 2nd, 3rd in a group; scaled up by tier. */
const PODIUM_COINS = [100, 60, 40];

export function podiumReward(rank: number, tier: number): number {
  const base = PODIUM_COINS[rank - 1] ?? 0;
  return base ? base + base * tier * 0.5 : 0;
}

/** Top 20% move up (at least one), bottom 20% move down (groups of 5+). */
export function zoneSizes(groupSize: number, tier: number) {
  const promote = tier >= TOP_TIER ? 0 : Math.max(1, Math.round(groupSize * 0.2));
  const demote = tier <= 0 || groupSize < 5 ? 0 : Math.floor(groupSize * 0.2);
  return { promote, demote };
}

export function outcomeFor(
  rank: number,
  groupSize: number,
  tier: number,
): LeagueOutcome {
  const { promote, demote } = zoneSizes(groupSize, tier);
  if (rank <= promote) return 'promoted';
  if (demote > 0 && rank > groupSize - demote) return 'demoted';
  return 'stayed';
}

export function currentWeek(at: Date = new Date()) {
  const p = periodContaining('weekly', at);
  return { week: p.label, endsAt: p.end };
}

/* -------------------------------------------------------------------------- */
/*                                    XP                                      */
/* -------------------------------------------------------------------------- */

/**
 * Add XP for this week, joining a group on the first XP of the week.
 */
export async function addLeagueXp(userId: string, xp: number): Promise<void> {
  if (!(xp > 0)) return;
  const { week } = currentWeek();

  const existing = await LeagueMember.updateOne({ userId, week }, { $inc: { xp } });
  if (existing.matchedCount > 0) return;

  const user = await User.findById(userId).select('leagueTier').lean();
  const tier = Math.min(Math.max(0, user?.leagueTier ?? 0), TOP_TIER);

  // Take a seat in the oldest open group of this tier, or open a new one.
  // ponytail: concurrent first joins can open two part-filled groups; harmless.
  const group =
    (await LeagueGroup.findOneAndUpdate(
      { week, tier, size: { $lt: GROUP_SIZE }, settledAt: null },
      { $inc: { size: 1 } },
      { sort: { createdAt: 1 }, returnDocument: 'after' },
    )) ?? (await LeagueGroup.create({ week, tier, size: 1 }));

  try {
    await LeagueMember.create({ userId, week, tier, groupId: group._id, xp });
  } catch (err: any) {
    if (err?.code !== 11000) throw err;
    // A parallel request joined first — give the seat back and add the XP.
    await LeagueGroup.updateOne({ _id: group._id }, { $inc: { size: -1 } });
    await LeagueMember.updateOne({ userId, week }, { $inc: { xp } });
  }
}

/* -------------------------------------------------------------------------- */
/*                                   VIEW                                     */
/* -------------------------------------------------------------------------- */

export async function getLeagueView(userId: string) {
  const { week, endsAt } = currentWeek();
  const [member, user] = await Promise.all([
    LeagueMember.findOne({ userId, week }).lean(),
    User.findById(userId).select('leagueTier').lean(),
  ]);

  const tier = member?.tier ?? Math.min(user?.leagueTier ?? 0, TOP_TIER);

  // Last settled week, so the app can say "You were promoted to Silver".
  const last = await LeagueMember.findOne({
    userId,
    week: { $ne: week },
    outcome: { $ne: null },
  })
    .sort({ week: -1 })
    .select('week tier finalRank outcome reward')
    .lean();

  let members: {
    rank: number;
    userId: string;
    username: string;
    avatar: string;
    xp: number;
    isMe: boolean;
  }[] = [];

  if (member) {
    const rows = await LeagueMember.find({ groupId: member.groupId })
      .sort({ xp: -1, _id: 1 })
      .limit(GROUP_SIZE + 10)
      .select('userId xp')
      .lean();
    const users = await User.find({
      _id: { $in: rows.map((r) => r.userId) },
      isBanned: { $ne: true },
      deletedAt: null,
    })
      .select('username avatar')
      .lean();
    const byId = new Map(users.map((u) => [String(u._id), u]));

    members = rows
      .filter((r) => byId.has(String(r.userId)))
      .map((r, i) => {
        const u = byId.get(String(r.userId))!;
        return {
          rank: i + 1,
          userId: String(r.userId),
          username: u.username ?? 'Player',
          avatar: u.avatar ?? '',
          xp: r.xp,
          isMe: String(r.userId) === String(userId),
        };
      });
  }

  const { promote, demote } = zoneSizes(Math.max(members.length, 1), tier);

  return {
    week,
    endsAt,
    tier,
    tierName: LEAGUE_TIERS[tier],
    tiers: LEAGUE_TIERS,
    joined: !!member,
    myXp: member?.xp ?? 0,
    promoteCount: promote,
    demoteCount: demote,
    rewards: PODIUM_COINS.map((_, i) => podiumReward(i + 1, tier)),
    members,
    lastResult: last
      ? {
          week: last.week,
          tier: last.tier,
          tierName: LEAGUE_TIERS[last.tier],
          rank: last.finalRank,
          outcome: last.outcome,
          reward: last.reward ?? 0,
        }
      : null,
  };
}

/* -------------------------------------------------------------------------- */
/*                                  SETTLE                                    */
/* -------------------------------------------------------------------------- */

/**
 * Settle every group from a finished week. Safe to run repeatedly, and to
 * resume after a crash: each member row is claimed (outcome: null → set)
 * before its tier moves or its reward is paid, and the group is only marked
 * settled once every member is done. XP is frozen once the week is over, so
 * a re-run ranks identically.
 */
export async function settleFinishedWeeks(at: Date = new Date()) {
  const { week } = currentWeek(at);
  const groups = await LeagueGroup.find({ settledAt: null, week: { $ne: week } })
    .select('_id')
    .lean();

  let settled = 0;
  for (const g of groups) {
    if (await settleGroup(g._id)) settled += 1;
  }
  return settled;
}

async function settleGroup(groupId: Types.ObjectId): Promise<boolean> {
  const group = await LeagueGroup.findOne({ _id: groupId, settledAt: null }).lean();
  if (!group) return false;

  const rows = await LeagueMember.find({ groupId })
    .sort({ xp: -1, _id: 1 })
    .select('userId xp')
    .lean();

  const n = rows.length;
  for (let i = 0; i < n; i++) {
    const row = rows[i];
    const rank = i + 1;
    const outcome = outcomeFor(rank, n, group.tier);
    const nextTier =
      outcome === 'promoted'
        ? Math.min(group.tier + 1, TOP_TIER)
        : outcome === 'demoted'
          ? Math.max(group.tier - 1, 0)
          : group.tier;
    const reward = podiumReward(rank, group.tier);

    // The member row is the claim for its own reward.
    const claimed = await LeagueMember.updateOne(
      { _id: row._id, outcome: null },
      { $set: { finalRank: rank, outcome, reward } },
    );
    if (!claimed.modifiedCount) continue;

    await User.updateOne({ _id: row.userId }, { $set: { leagueTier: nextTier } });
    if (reward > 0) {
      await creditCoins(row.userId, reward, 'league_reward', {
        note: `${LEAGUE_TIERS[group.tier]} league ${group.week} — rank #${rank}`,
      }).catch((err) =>
        logger.error('League reward failed', err, { userId: String(row.userId) }),
      );
    }
  }

  await LeagueGroup.updateOne({ _id: groupId }, { $set: { settledAt: new Date() } });

  logger.info('League group settled', {
    week: group.week,
    tier: LEAGUE_TIERS[group.tier],
    members: n,
  });
  return true;
}
