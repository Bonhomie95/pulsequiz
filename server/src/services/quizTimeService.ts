import { Types } from 'mongoose';
import ActiveQuizSession from '../models/ActiveQuizSession';
import { debitCoins } from './coinService';

const EXTEND_COST = 20;
const MAX_EXTENSIONS = 10;
const EXTEND_SECONDS = 10;

export async function extendQuestionTime(params: {
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

  // 🔒 Must extend current question only
  if (
    !session.currentQuestionId ||
    session.currentQuestionId.toString() !== questionId
  ) {
    return { addedSeconds: 0, message: 'Not current question' };
  }

  const qId = new Types.ObjectId(questionId);

  // ❌ Once per question
  if (session.timeExtendedQuestions.some((id) => id.equals(qId))) {
    return { addedSeconds: 0, message: 'Already extended' };
  }

  // ❌ Max per session
  if (session.timeExtensionsUsed >= MAX_EXTENSIONS) {
    return { addedSeconds: 0, message: 'No extensions left' };
  }

  // ⏱ Extend deadline (SOURCE OF TRUTH). Claimed atomically so two concurrent
  // requests can't stack two extensions — or be charged for two.
  const base = session.questionDeadlineAt?.getTime() ?? Date.now();
  const newDeadline = new Date(base + EXTEND_SECONDS * 1000);

  const claimed = await ActiveQuizSession.findOneAndUpdate(
    {
      _id: sessionId,
      userId,
      finished: false,
      currentQuestionId: qId,
      timeExtendedQuestions: { $ne: qId },
      timeExtensionsUsed: { $lt: MAX_EXTENSIONS },
    },
    {
      $set: { questionDeadlineAt: newDeadline },
      $inc: { timeExtensionsUsed: 1 },
      $push: { timeExtendedQuestions: qId },
    },
    { returnDocument: 'after' },
  );

  if (!claimed) {
    return { addedSeconds: 0, message: 'Already extended' };
  }

  // Atomic conditional debit, logged to the ledger.
  const debit = await debitCoins(userId, EXTEND_COST, 'hint_used', { sessionId });

  if (!debit.success) {
    // Roll the extension back — they didn't pay for it.
    await ActiveQuizSession.updateOne(
      { _id: sessionId },
      {
        $set: { questionDeadlineAt: session.questionDeadlineAt ?? null },
        $inc: { timeExtensionsUsed: -1 },
        $pull: { timeExtendedQuestions: qId },
      },
    );
    // 📺 Not enough coins → frontend offers an ad instead
    return { requiresAd: true, coins: debit.balance };
  }

  const remainingSeconds = Math.max(
    0,
    Math.ceil((newDeadline.getTime() - Date.now()) / 1000)
  );

  return {
    addedSeconds: EXTEND_SECONDS,
    coins: debit.balance,
    cost: EXTEND_COST,
    deadlineAt: newDeadline,
    remainingSeconds,
  };
}
