import { Types } from 'mongoose';
import ActiveQuizSession from '../models/ActiveQuizSession';
import QuizQuestion from '../models/QuizQuestion';
import { debitCoins, getBalance } from './coinService';

const HINT_COSTS = [10, 20, 50] as const;

export async function useHintService(params: {
  userId: string;
  sessionId: string;
  questionId: string;
}) {
  const { userId, sessionId, questionId } = params;

  const session = await ActiveQuizSession.findOne({
    _id: sessionId,
    userId,
    finished: false,
  });

  if (!session) throw new Error('Session not found');

  // ✅ Rule 1: max 3 per session
  if (session.hintsUsed >= 3) {
    return { disabledIndex: null, coins: null, message: 'No hints left' };
  }

  // ✅ Rule 2: only once per question
  const qIdObj = new Types.ObjectId(questionId);
  const alreadyHinted = session.hintedQuestions?.some(
    (id: any) => id.toString() === qIdObj.toString()
  );

  if (alreadyHinted) {
    return {
      disabledIndex: null,
      coins: null,
      message: 'Hint already used for this question',
    };
  }

  // Ensure this question is actually in this session (anti-cheat)
  const inSession = session.questions.some(
    (q: any) => q.questionId.toString() === qIdObj.toString()
  );
  if (!inSession) throw new Error('Question not in session');

  // Fetch correct answer (server knows it, client doesn't)
  const qq: any = await QuizQuestion.findById(qIdObj).lean();
  if (!qq) throw new Error('Question missing');

  const correctIndex =
    typeof qq.correctIndex === 'number'
      ? qq.correctIndex
      : typeof qq.answer === 'number'
      ? qq.answer
      : null;

  if (typeof correctIndex !== 'number') {
    throw new Error('correctIndex missing');
  }

  // Pick ONE wrong option to disable
  const wrongIndexes = [0, 1, 2, 3].filter((i) => i !== correctIndex);
  const disabledIndex =
    wrongIndexes[Math.floor(Math.random() * wrongIndexes.length)];

  const cost = HINT_COSTS[session.hintsUsed] ?? 999;

  // Claim the hint slot BEFORE taking payment. The conditional update means
  // two concurrent requests can't both consume the same slot, so we never
  // charge twice for one hint.
  const claimed = await ActiveQuizSession.findOneAndUpdate(
    {
      _id: sessionId,
      userId,
      finished: false,
      hintsUsed: session.hintsUsed,
      hintedQuestions: { $ne: qIdObj },
    },
    { $inc: { hintsUsed: 1 }, $push: { hintedQuestions: qIdObj } },
    { returnDocument: 'after' },
  );

  if (!claimed) {
    return {
      disabledIndex: null,
      coins: await getBalance(userId),
      message: 'Hint already used for this question',
    };
  }

  // Atomic conditional debit through the ledger. This used to be a
  // read-modify-write straight onto the wallet, which both lost concurrent
  // writes and left no CoinTransaction row to reconcile against.
  const debit = await debitCoins(userId, cost, 'hint_used', { sessionId });

  if (!debit.success) {
    // Give the hint slot back — they didn't get one.
    await ActiveQuizSession.updateOne(
      { _id: sessionId },
      { $inc: { hintsUsed: -1 }, $pull: { hintedQuestions: qIdObj } },
    );
    return {
      disabledIndex: null,
      coins: debit.balance,
      message: 'Not enough coins',
    };
  }

  return {
    disabledIndex,
    coins: debit.balance,
    cost,
    hintsUsed: claimed.hintsUsed,
  };
}
