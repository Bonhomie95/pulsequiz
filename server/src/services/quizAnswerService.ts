import ActiveQuizSession from '../models/ActiveQuizSession';
import QuizQuestion from '../models/QuizQuestion';
import { TIME_PER_QUESTION, isAnswerTooLate, revealPauseMs } from '../config/quizTiming';

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

  // ⏱ SERVER-AUTHORITATIVE DEADLINE (with round-trip grace — see quizTiming)
  if (isAnswerTooLate(session.questionDeadlineAt)) {
    throw new Error('Answer too late');
  }

  // 🔁 No double submit
  if (session.answers.some((a) => a.questionId.toString() === questionId)) {
    throw new Error('Already answered');
  }

  const q = await QuizQuestion.findById(questionId).lean();
  if (!q) throw new Error('Question not found');

  const isCorrect = selected !== null && selected === q.answer;
  const explanation = q.explanation || null;
  const now = Date.now();

  // Save answer
  session.answers.push({
    questionId: q._id,
    selected,
    isCorrect,
    answeredAt: new Date(now),
  });

  if (isCorrect && session.questionDeadlineAt) {
    session.timeLeftMs =
      (session.timeLeftMs ?? 0) +
      Math.max(0, Math.min(TIME_PER_QUESTION * 1000, session.questionDeadlineAt.getTime() - now));
  }

  // ❌ Classic is sudden death: a wrong answer or a timeout ends the run.
  // Every other mode plays all the questions.
  const suddenDeath = (session.mode ?? 'classic') === 'classic';
  if (!isCorrect && suddenDeath) {
    session.finished = true;
    await session.save();

    return {
      correct: false,
      finished: true,
      correctIndex: q.answer,
      explanation,
    };
  }

  // Move to the next question
  session.currentIndex += 1;

  // 🏁 Last question
  if (session.currentIndex >= session.questions.length) {
    session.finished = true;
    await session.save();

    return {
      correct: isCorrect,
      finished: true,
      correctIndex: q.answer,
      explanation,
    };
  }

  // ▶️ Advance to next question
  const nextQ = session.questions[session.currentIndex].questionId;

  session.currentQuestionId = nextQ;

  // ⏱ Next question's deadline. Unranked modes pause to show the answer (and
  // its explanation) before the clock starts again.
  const pause = suddenDeath ? 0 : revealPauseMs(!!explanation);
  session.questionDeadlineAt = new Date(now + pause + TIME_PER_QUESTION * 1000);

  await session.save();

  return {
    correct: isCorrect,
    finished: false,
    correctIndex: q.answer,
    explanation,
    nextQuestionId: nextQ.toString(),
    deadlineAt: session.questionDeadlineAt,
  };
}
