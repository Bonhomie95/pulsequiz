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
) {
  const seen = await UserQuestion.find({ userId, category, difficulty })
    .select('questionId')
    .lean();

  const seenIds = seen.map((s) => s.questionId);

  const qs = await QuizQuestion.find({
    category,
    difficulty,
    _id: { $nin: seenIds },
  })
    .limit(count)
    .lean();

  // ❌ HARD STOP — no resets, no repeats
  if (qs.length < count) {
    throw new Error(
      `Question pool exhausted for "${category}" (${difficulty}).`,
    );
  }

  return qs;
}

/* ---------------- MAIN ---------------- */

export async function startQuizSession({
  userId,
  category,
}: {
  userId: string;
  category: string;
}) {
  const picked: { q: any; difficulty: Diff }[] = [];

  /* 1️⃣ Pull EXACT difficulty counts */
  for (const diff of ['easy', 'medium', 'hard'] as Diff[]) {
    const need = DIFF_TARGET[diff];
    const qs = await fetchUnseen(userId, category, diff, need);

    qs.forEach((q) => picked.push({ q, difficulty: diff }));
  }

  /* 2️⃣ Hard guard (should never fail if fetchUnseen is strict) */
  if (picked.length !== TOTAL_Q) {
    throw new Error(
      `Invalid quiz build for "${category}". Expected ${TOTAL_Q}, got ${picked.length}.`,
    );
  }

  /* 3️⃣ Strict ordering: Easy → Medium → Hard (shuffle within only) */
  const ordered: { q: any; difficulty: Diff }[] = [];

  for (const diff of ['easy', 'medium', 'hard'] as Diff[]) {
    const block = picked.filter((p) => p.difficulty === diff);

    if (block.length !== DIFF_TARGET[diff]) {
      throw new Error(
        `Difficulty mismatch for "${category}" (${diff}). Expected ${DIFF_TARGET[diff]}, got ${block.length}.`,
      );
    }

    ordered.push(...shuffle(block));
  }

  /* 4️⃣ Persist exposure (ANTI-REPEAT SOURCE OF TRUTH) */
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

  /* 5️⃣ Create active session */
  const now = Date.now();
  const expiresAt = new Date(now + TOTAL_Q * TIME_PER_QUESTION * 1000 + 30_000);

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
  });

  /* 6️⃣ Return payload (order preserved) */
  return {
    sessionId: session._id.toString(),
    timePerQuestion: TIME_PER_QUESTION,
    totalQuestions: TOTAL_Q,
    expiresAt,
    questions: ordered.map(({ q, difficulty }) => ({
      id: q._id.toString(),
      question: q.question,
      options: q.options,
      difficulty,
    })),
  };
}
