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

function shuffle<T>(arr: T[]) {
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
  count: number
) {
  const seen = await UserQuestion.find({ userId, category, difficulty })
    .select('questionId')
    .lean();

  const seenIds = seen.map((s) => s.questionId);

  let qs = await QuizQuestion.find({
    category,
    difficulty,
    _id: { $nin: seenIds },
  })
    .limit(count)
    .lean();

  // Reset exposure for this difficulty if exhausted
  if (qs.length < count) {
    await UserQuestion.deleteMany({ userId, category, difficulty });
    qs = await QuizQuestion.find({ category, difficulty }).limit(count).lean();
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

  /* 1️⃣ Targeted difficulty pull */
  for (const diff of Object.keys(DIFF_TARGET) as Diff[]) {
    const need = DIFF_TARGET[diff];
    const qs = await fetchUnseen(userId, category, diff, need);
    qs.forEach((q) => picked.push({ q, difficulty: diff }));
  }

  /* 2️⃣ Fallback fill (any difficulty, unseen first) */
  if (picked.length < TOTAL_Q) {
    const existing = new Set(picked.map((p) => p.q._id.toString()));

    const extra = await QuizQuestion.find({ category }).limit(50).lean();

    for (const q of extra) {
      if (picked.length >= TOTAL_Q) break;
      if (existing.has(q._id.toString())) continue;

      picked.push({
        q,
        difficulty: (q.difficulty as Diff) ?? 'medium',
      });

      existing.add(q._id.toString());
    }
  }

  /* 3️⃣ Hard guard */
  if (picked.length < TOTAL_Q) {
    throw new Error(
      `Not enough questions in "${category}". Need ${TOTAL_Q}, found ${picked.length}.`
    );
  }

  const randomized = shuffle(picked);

  /* 4️⃣ Exposure tracking */
  await UserQuestion.insertMany(
    randomized.map(({ q, difficulty }) => ({
      userId: new Types.ObjectId(userId),
      questionId: q._id,
      category,
      difficulty,
    })),
    { ordered: false }
  ).catch(() => {});

  /* 5️⃣ Session */
  const expiresAt = new Date(
    Date.now() + TOTAL_Q * TIME_PER_QUESTION * 1000 + 30_000
  );

  const session = await ActiveQuizSession.create({
    userId,
    category,
    questions: randomized.map(({ q, difficulty }) => ({
      questionId: q._id,
      difficulty,
    })),
    answers: [],
    currentIndex: 0,
    startedAt: new Date(),
    expiresAt,
    finished: false,
  });

  return {
    sessionId: session._id.toString(),
    timePerQuestion: TIME_PER_QUESTION,
    totalQuestions: TOTAL_Q,
    expiresAt,
    questions: randomized.map(({ q, difficulty }) => ({
      id: q._id.toString(),
      question: q.question,
      options: q.options,
      difficulty,
    })),
  };
}
