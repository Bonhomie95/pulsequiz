/**
 * challengeService.ts — auto-seed, track progress, claim rewards
 */
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isoWeek from 'dayjs/plugin/isoWeek';
import Challenge from '../models/Challenge';
import User from '../models/User';
import Progress from '../models/Progress';
import { creditCoins } from './coinService';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

const TZ = 'Africa/Lagos';

/* ────────────────────────── Period labels ────────────────────────── */

export function getDailyLabel(): string {
  return dayjs().tz(TZ).format('YYYY-MM-DD');
}
export function getWeeklyLabel(): string {
  const d = dayjs().tz(TZ);
  return `${d.year()}-W${String((d as any).isoWeek()).padStart(2, '0')}`;
}

/* ─────────────────────── Challenge templates ─────────────────────── */

type Metric = 'quizzes_played' | 'correct_answers' | 'perfect_scores';

interface Template {
  title: string;
  description: string;
  type: 'daily' | 'weekly';
  metric: Metric;
  targetValue: number;
  rewardCoins: number;
  rewardPoints: number;
}

const DAILY: Template[] = [
  { title: 'Quick Learner',   description: 'Complete 2 quizzes today',             type: 'daily',  metric: 'quizzes_played',  targetValue: 2,  rewardCoins: 50,  rewardPoints: 5  },
  { title: 'Sharp Mind',      description: 'Answer 15 questions correctly today',   type: 'daily',  metric: 'correct_answers', targetValue: 15, rewardCoins: 75,  rewardPoints: 8  },
  { title: 'Perfectionist',   description: 'Get a perfect score on any quiz',       type: 'daily',  metric: 'perfect_scores',  targetValue: 1,  rewardCoins: 100, rewardPoints: 10 },
  { title: 'Daily Grind',     description: 'Complete 3 quizzes today',              type: 'daily',  metric: 'quizzes_played',  targetValue: 3,  rewardCoins: 80,  rewardPoints: 8  },
  { title: 'Trivia Blitz',    description: 'Answer 20 questions correctly today',   type: 'daily',  metric: 'correct_answers', targetValue: 20, rewardCoins: 90,  rewardPoints: 10 },
];

const WEEKLY: Template[] = [
  { title: 'Weekly Warrior',  description: 'Complete 15 quizzes this week',         type: 'weekly', metric: 'quizzes_played',  targetValue: 15, rewardCoins: 500,  rewardPoints: 50  },
  { title: 'Century Club',    description: 'Answer 100 questions correctly this week', type: 'weekly', metric: 'correct_answers', targetValue: 100, rewardCoins: 750, rewardPoints: 75 },
  { title: 'Perfect Week',    description: 'Get 5 perfect scores this week',        type: 'weekly', metric: 'perfect_scores',  targetValue: 5,  rewardCoins: 1000, rewardPoints: 100 },
  { title: 'Dedicated Scholar', description: 'Complete 10 quizzes this week',       type: 'weekly', metric: 'quizzes_played',  targetValue: 10, rewardCoins: 350,  rewardPoints: 35  },
  { title: 'Answer Machine',  description: 'Answer 75 questions correctly this week', type: 'weekly', metric: 'correct_answers', targetValue: 75, rewardCoins: 600, rewardPoints: 60 },
];

function pickRandom<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

/* ─────────────────────── Seed for one user ───────────────────────── */

export async function seedChallengesForUser(userId: string): Promise<void> {
  const now = dayjs().tz(TZ);
  const dailyPeriod = getDailyLabel();
  const weeklyPeriod = getWeeklyLabel();

  // Count ANY challenges for this period (including expired/completed) to avoid re-seeding
  const existingDaily  = await Challenge.countDocuments({ userId, type: 'daily',  periodLabel: dailyPeriod  });
  const existingWeekly = await Challenge.countDocuments({ userId, type: 'weekly', periodLabel: weeklyPeriod });

  if (existingDaily === 0) {
    const templates = pickRandom(DAILY, 2);
    const expiresAt = now.endOf('day').toDate();
    await Challenge.insertMany(templates.map((t) => ({
      userId, type: 'daily', title: t.title, description: t.description,
      metric: t.metric, targetValue: t.targetValue, currentValue: 0,
      rewardCoins: t.rewardCoins, rewardPoints: t.rewardPoints,
      status: 'active', periodLabel: dailyPeriod, expiresAt,
    })));
  }

  if (existingWeekly === 0) {
    const templates = pickRandom(WEEKLY, 2);
    const expiresAt = (now as any).endOf('isoWeek').toDate();
    await Challenge.insertMany(templates.map((t) => ({
      userId, type: 'weekly', title: t.title, description: t.description,
      metric: t.metric, targetValue: t.targetValue, currentValue: 0,
      rewardCoins: t.rewardCoins, rewardPoints: t.rewardPoints,
      status: 'active', periodLabel: weeklyPeriod, expiresAt,
    })));
  }
}

/* ─────────────────────── Seed for ALL users (cron) ──────────────── */

export async function seedChallengesForAllUsers(): Promise<void> {
  const users = await User.find({}, '_id').lean();
  await Promise.all((users as any[]).map((u) =>
    seedChallengesForUser(u._id.toString()).catch(() => {}),
  ));
}

/* ─────────────────────── Progress tracking ──────────────────────── */

export async function updateChallengeProgress(params: {
  userId: string;
  correct: number;
  total: number;
}): Promise<void> {
  const { userId, correct, total } = params;
  const isPerfect = correct > 0 && correct === total;

  const challenges = await Challenge.find({
    userId,
    status: 'active',
    periodLabel: { $in: [getDailyLabel(), getWeeklyLabel()] },
  });

  for (const ch of challenges) {
    const metric = (ch as any).metric as Metric;
    let delta = 0;
    if (metric === 'quizzes_played')   delta = 1;
    if (metric === 'correct_answers')  delta = correct;
    if (metric === 'perfect_scores')   delta = isPerfect ? 1 : 0;
    if (delta === 0) continue;

    ch.currentValue = Math.min(ch.currentValue + delta, ch.targetValue);
    if (ch.currentValue >= ch.targetValue) {
      ch.status = 'completed';
      ch.completedAt = new Date();
      // Reward claimed manually by user (with interstitial ad gate)
    }
    await ch.save();
  }
}

/* ─────────────────────── Claim reward ───────────────────────────── */

export async function claimChallengeReward(
  userId: string,
  challengeId: string,
): Promise<{ rewardCoins: number; rewardPoints: number }> {
  const ch = await Challenge.findOne({ _id: challengeId, userId });
  if (!ch) throw new Error('Challenge not found');
  if (ch.status !== 'completed') throw new Error('Challenge not yet completed');

  // Mark consumed so it can't be claimed again
  ch.status = 'expired';
  await ch.save();

  if (ch.rewardCoins > 0) {
    await creditCoins(userId, ch.rewardCoins, 'challenge_reward', {
      note: `challenge:${ch._id}`,
    });
  }
  if (ch.rewardPoints > 0) {
    await Progress.updateOne({ userId }, { $inc: { points: ch.rewardPoints } });
  }

  return { rewardCoins: ch.rewardCoins, rewardPoints: ch.rewardPoints };
}
