import ActiveQuizSession from '../models/ActiveQuizSession';
import QuizQuestion from '../models/QuizQuestion';

export async function submitQuizAnswer(params: {
  userId: string;
  sessionId: string;
  questionId: string;
  selected: number | null;
}) {
  const { userId, sessionId, questionId, selected } = params;

  const session = await ActiveQuizSession.findOne({
    _id: sessionId,
    userId,
    finished: false,
  });

  if (!session) throw new Error('Session not found');

  // 🔒 Must answer current question only
  if (
    !session.currentQuestionId ||
    session.currentQuestionId.toString() !== questionId
  ) {
    throw new Error('Not current question');
  }

  // ⏱ SERVER-AUTHORITATIVE DEADLINE
  if (
    session.questionDeadlineAt &&
    Date.now() > session.questionDeadlineAt.getTime()
  ) {
    throw new Error('Answer too late');
  }

  // 🔁 No double submit
  if (session.answers.some((a) => a.questionId.toString() === questionId)) {
    throw new Error('Already answered');
  }

  const q = await QuizQuestion.findById(questionId).lean();
  if (!q) throw new Error('Question not found');

  const isCorrect = selected !== null && selected === q.answer;

  // Save answer
  session.answers.push({
    questionId: q._id,
    selected,
    isCorrect,
    answeredAt: new Date(),
  });

  // ❌ Wrong or timeout ends game immediately (your rule)
  if (!isCorrect || selected === null) {
    session.finished = true;
    await session.save();

    return {
      correct: false,
      finished: true,
      correctIndex: q.answer,
    };
  }

  // ✅ Correct → move to next question
  session.currentIndex += 1;

  // 🏁 Last question
  if (session.currentIndex >= session.questions.length) {
    session.finished = true;
    await session.save();

    return {
      correct: true,
      finished: true,
      correctIndex: q.answer,
    };
  }

  // ▶️ Advance to next question
  const nextQ = session.questions[session.currentIndex].questionId;

  session.currentQuestionId = nextQ;

  // ⏱ Reset deadline for next question
  session.questionDeadlineAt = new Date(Date.now() + 15_000);

  await session.save();

  return {
    correct: true,
    finished: false,
    correctIndex: q.answer,
    nextQuestionId: nextQ.toString(),
    deadlineAt: session.questionDeadlineAt,
  };
}
