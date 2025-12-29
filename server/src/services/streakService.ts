import Streak from '../models/Streak';
import CoinWallet from '../models/CoinWallet';
import dayjs from 'dayjs';

export async function checkInStreak(userId: string) {
  const today = dayjs().startOf('day');
  const yesterday = today.subtract(1, 'day');

  const streak = await Streak.findOne({ userId });
  if (!streak) throw new Error('Streak missing');

  if (streak.lastCheckIn && dayjs(streak.lastCheckIn).isSame(today)) {
    return { alreadyCheckedIn: true };
  }

  const isConsecutive =
    streak.lastCheckIn && dayjs(streak.lastCheckIn).isSame(yesterday);

  streak.streak = isConsecutive ? streak.streak + 1 : 1;
  streak.lastCheckIn = today.toDate();
  await streak.save();

  // Reward logic
  const baseReward = Math.min(20 * streak.streak, 200);
  let milestoneBonus = 0;

  if (streak.streak === 10) milestoneBonus = 500;
  if (streak.streak === 20) milestoneBonus = 1000;
  if (streak.streak === 30) milestoneBonus = 2000;

  await CoinWallet.updateOne(
    { userId },
    { $inc: { coins: baseReward + milestoneBonus } }
  );

  return {
    streak: streak.streak,
    coinsAdded: baseReward + milestoneBonus,
    milestoneBonus,
  };
}
