import ActiveQuizSession from '../models/ActiveQuizSession';
import QuizQuestion from '../models/QuizQuestion';

const TIME_PER_QUESTION = 15;
const GRACE_MS = 1500;

export async function submitQuizAnswer(params: {
  userId: string;
  sessionId: string;
  questionId: string;
  selected: number | null;
}) {
  const { userId, sessionId, questionId, selected } = params;

  const session = await ActiveQuizSession.findOne({ _id: sessionId, userId });
  if (!session) throw new Error('Session not found');
  if (session.finished) throw new Error('Session already finished');

  const idx = session.currentIndex;
  const expected = session.questions[idx];
  if (!expected) throw new Error('No more questions');

  // Must answer the current question only (prevents skipping / reordering)
  if (expected.questionId.toString() !== questionId) {
    throw new Error('Out-of-order answer attempt');
  }

  // No double-submit
  const already = session.answers.find(
    (a) => a.questionId.toString() === questionId
  );
  if (already) throw new Error('Already answered');

  // Timing check (server authoritative)
  const lastAnsweredAt =
    idx === 0
      ? session.startedAt.getTime()
      : session.answers[idx - 1].answeredAt.getTime();

  const deadline = lastAnsweredAt + TIME_PER_QUESTION * 1000;

  const now = Date.now();

  // If user submits after deadline, only allow null (timeout), block “late correct”
  if (now > deadline + GRACE_MS && selected !== null) {
    throw new Error('Answer too late');
  }

  // Determine correctness
  const q = await QuizQuestion.findById(questionId).lean();
  if (!q) throw new Error('Question not found');

  const isCorrect = selected !== null && selected === q.answer;

  session.answers.push({
    questionId: q._id,
    selected,
    isCorrect,
    answeredAt: new Date(),
  });

  session.currentIndex = idx + 1;

  // Auto-finish when done
  if (session.currentIndex >= session.questions.length) {
    session.finished = true;
  }

  await session.save();

  return {
    correct: isCorrect,
    finished: session.finished,
    nextQuestionId: session.finished
      ? null
      : session.questions[session.currentIndex].questionId.toString(),
  };
}
