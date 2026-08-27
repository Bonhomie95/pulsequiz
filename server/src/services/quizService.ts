import { Types } from 'mongoose';
import QuizQuestion from '../models/QuizQuestion';
import UserQuestion from '../models/UserQuestion';
import ActiveQuizSession from '../models/ActiveQuizSession';

type Diff = 'easy' | 'medium' | 'hard';

const TIME_PER_QUESTION = 15;
const TOTAL_Q = 10;

const DIFF_TARGET: Record<Diff, number> = {
  easy: 4,
  medium: 4,
  hard: 2,
};

/**
 * Cap on how many previously-seen question ids we exclude.
 *
 * An unbounded $nin array grows with every game a dedicated player finishes,
 * until the query document itself exceeds Mongo's 16MB limit and every quiz
 * start fails. Excluding the most recent N is the same experience in practice.
 */
const MAX_SEEN_EXCLUSIONS = 300;

/* ---------------- UTIL ---------------- */

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------------- FETCH ---------------- */

async function fetchUnseen(
  userId: string,
  category: string,
  difficulty: Diff,
  count: number,
): Promise<any[]> {
  // How many questions exist at all for this difficulty?
  const totalAvailable = await QuizQuestion.countDocuments({ category, difficulty, disabled: { $ne: true } });

  // No questions seeded yet for this difficulty — return empty, handled by caller
  if (totalAvailable === 0) return [];

  const seen = await UserQuestion.find({ userId, category, difficulty })
    .select('questionId')
    .sort({ createdAt: -1 })
    .limit(MAX_SEEN_EXCLUSIONS)
    .lean();
  const seenIds = seen.map((s) => s.questionId);

  let qs = await QuizQuestion.find({
    category,
    disabled: { $ne: true },
    difficulty,
    _id: { $nin: seenIds },
  })
    .limit(count)
    .lean();

  // Pool exhausted for this difficulty — reset per-difficulty seen history and recycle
  if (qs.length < count) {
    await UserQuestion.deleteMany({ userId, category, difficulty });
    qs = await QuizQuestion.find({ category, difficulty, disabled: { $ne: true } })
      .limit(count)
      .lean();
  }

  // Fewer questions than needed (small pool) — return whatever exists
  return qs;
}

/* ---------------- MAIN ---------------- */

export async function startQuizSession({
  userId,
  category,
  tournamentId,
}: {
  userId: string;
  category: string;
  tournamentId?: string;
}) {
  const picked: { q: any; difficulty: Diff }[] = [];

  /* 1️⃣ Pull up to the target count per difficulty — gracefully handle small pools */
  for (const diff of ['easy', 'medium', 'hard'] as Diff[]) {
    const need = DIFF_TARGET[diff];
    const qs = await fetchUnseen(userId, category, diff, need);
    qs.forEach((q) => picked.push({ q, difficulty: diff }));
  }

  /* 2️⃣ If we got fewer than TOTAL_Q, top up from any difficulty (unseen first) */
  if (picked.length < TOTAL_Q) {
    const pickedIds = new Set(picked.map((p) => p.q._id.toString()));
    const seenAll = await UserQuestion.find({ userId, category })
      .select('questionId')
      .sort({ createdAt: -1 })
      .limit(MAX_SEEN_EXCLUSIONS)
      .lean();
    const seenIds = seenAll.map((s) => s.questionId);

    const extras = await QuizQuestion.find({
      category,
      disabled: { $ne: true },
      _id: { $nin: [...seenIds, ...Array.from(pickedIds)] },
    })
      .limit(TOTAL_Q - picked.length)
      .lean();

    extras.forEach((q) => picked.push({ q, difficulty: q.difficulty }));
  }

  /* 3️⃣ Still not enough? Recycle from ALL category questions */
  if (picked.length < TOTAL_Q) {
    const pickedIds = new Set(picked.map((p) => p.q._id.toString()));
    const fallback = await QuizQuestion.find({
      category,
      disabled: { $ne: true },
      _id: { $nin: Array.from(pickedIds) },
    })
      .limit(TOTAL_Q - picked.length)
      .lean();

    fallback.forEach((q) => picked.push({ q, difficulty: q.difficulty }));
  }

  /* 4️⃣ Last resort: if category has fewer than TOTAL_Q questions total, use what we have */
  if (picked.length === 0) {
    throw new Error(
      `No questions found for category "${category}". Please seed questions first.`,
    );
  }

  /* 5️⃣ Order: Easy → Medium → Hard (shuffle within each block) */
  const ordered: { q: any; difficulty: Diff }[] = [];
  for (const diff of ['easy', 'medium', 'hard'] as Diff[]) {
    const block = picked.filter((p) => p.difficulty === diff);
    ordered.push(...shuffle(block));
  }
  // Any questions without a matching difficulty bucket go at the end
  const bucketed = new Set(ordered.map((o) => o.q._id.toString()));
  picked.filter((p) => !bucketed.has(p.q._id.toString())).forEach((p) => ordered.push(p));

  /* 6️⃣ Persist exposure (ANTI-REPEAT SOURCE OF TRUTH) */
  await UserQuestion.insertMany(
    ordered.map(({ q, difficulty }) => ({
      userId: new Types.ObjectId(userId),
      questionId: q._id,
      category,
      difficulty,
    })),
    { ordered: false },
  ).catch(() => {
    // ignore duplicate insert errors safely
  });

  /* 7️⃣ Create active session — use actual question count, not fixed TOTAL_Q */
  const actualTotal = ordered.length;
  const now = Date.now();
  const expiresAt = new Date(now + actualTotal * TIME_PER_QUESTION * 1000 + 30_000);

  const session = await ActiveQuizSession.create({
    userId,
    category,
    questions: ordered.map(({ q, difficulty }) => ({
      questionId: q._id,
      difficulty,
    })),
    answers: [],
    currentIndex: 0,
    startedAt: new Date(),
    expiresAt,
    finished: false,

    // server-authoritative timing
    currentQuestionId: ordered[0].q._id,
    questionDeadlineAt: new Date(now + TIME_PER_QUESTION * 1000),
    ...(tournamentId ? { tournamentId } : {}),
  });

  /* 8️⃣ Return payload (order preserved) */
  return {
    sessionId: session._id.toString(),
    timePerQuestion: TIME_PER_QUESTION,
    totalQuestions: actualTotal,
    expiresAt,
    questions: ordered.map(({ q, difficulty }) => ({
      id: q._id.toString(),
      question: q.question,
      options: q.options,
      difficulty,
    })),
  };
}
