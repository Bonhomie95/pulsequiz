import { Types } from 'mongoose';
import ActiveQuizSession from '../models/ActiveQuizSession';
import CoinWallet from '../models/CoinWallet';

const EXTEND_COST = 20;
const MAX_EXTENSIONS = 10;

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

  const qId = new Types.ObjectId(questionId);

  // Rule 1: once per question
  if (session.timeExtendedQuestions.includes(qId)) {
    return { addedSeconds: 0, message: 'Already extended' };
  }

  // Rule 2: max 10 per session
  if (session.timeExtensionsUsed >= MAX_EXTENSIONS) {
    return { addedSeconds: 0, message: 'No extensions left' };
  }

  const wallet = await CoinWallet.findOne({ userId });
  if (!wallet) throw new Error('Wallet missing');

  // 🚨 Not enough coins → frontend must show ad
  if (wallet.coins < EXTEND_COST) {
    return { requiresAd: true };
  }

  // Deduct coins
  wallet.coins -= EXTEND_COST;
  await wallet.save();

  session.timeExtensionsUsed += 1;
  session.timeExtendedQuestions.push(qId);
  await session.save();

  return {
    addedSeconds: 10,
    coins: wallet.coins,
  };
}
