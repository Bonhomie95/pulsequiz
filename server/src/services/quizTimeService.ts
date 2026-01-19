import { Types } from 'mongoose';
import ActiveQuizSession from '../models/ActiveQuizSession';
import CoinWallet from '../models/CoinWallet';

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

  const wallet = await CoinWallet.findOne({ userId });
  if (!wallet) throw new Error('Wallet missing');

  // 📺 Not enough coins → frontend shows ad
  if (wallet.coins < EXTEND_COST) {
    return { requiresAd: true };
  }

  // 💰 Deduct coins
  wallet.coins -= EXTEND_COST;
  await wallet.save();

  // ⏱ Extend deadline (SOURCE OF TRUTH)
  const base = session.questionDeadlineAt?.getTime() ?? Date.now();

  const newDeadline = new Date(base + EXTEND_SECONDS * 1000);

  session.questionDeadlineAt = newDeadline;
  session.timeExtensionsUsed += 1;
  session.timeExtendedQuestions.push(qId);

  await session.save();

  const remainingSeconds = Math.max(
    0,
    Math.ceil((newDeadline.getTime() - Date.now()) / 1000)
  );

  return {
    addedSeconds: EXTEND_SECONDS,
    coins: wallet.coins,
    deadlineAt: newDeadline,
    remainingSeconds,
  };
}
