import { Types } from 'mongoose';
import ActiveQuizSession from '../models/ActiveQuizSession';
import QuizQuestion from '../models/QuizQuestion';
import CoinWallet from '../models/CoinWallet';

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

  // ✅ Deduct coins on backend (secure)
  const cost = HINT_COSTS[session.hintsUsed] ?? 999;

  const wallet = await CoinWallet.findOne({ userId });
  if (!wallet) throw new Error('Wallet missing');

  if (wallet.coins < cost) {
    return {
      disabledIndex: null,
      coins: wallet.coins,
      message: 'Not enough coins',
    };
  }

  wallet.coins -= cost;
  await wallet.save();

  // persist hint usage
  session.hintsUsed += 1;
  session.hintedQuestions.push(qIdObj);
  await session.save();

  return {
    disabledIndex,
    coins: wallet.coins,
    hintsUsed: session.hintsUsed,
  };
}
