import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import Streak from '../models/Streak';
import CoinWallet from '../models/CoinWallet';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Africa/Lagos'; // GMT+1

export async function checkInStreak(userId: string) {
  const now = dayjs().tz(TZ);
  const today = now.startOf('day');
  const yesterday = today.subtract(1, 'day');

  const streak = await Streak.findOne({ userId });
  if (!streak) throw new Error('Streak missing');

  if (streak.lastCheckIn && dayjs(streak.lastCheckIn).tz(TZ).isSame(today)) {
    return {
      alreadyCheckedIn: true,
      lastCheckIn: streak.lastCheckIn,
      streak: streak.streak,
      coinsAdded: 0,
      milestoneBonus: 0,
    };
  }

  const isConsecutive =
    streak.lastCheckIn && dayjs(streak.lastCheckIn).tz(TZ).isSame(yesterday);

  streak.streak = isConsecutive ? streak.streak + 1 : 1;
  streak.lastCheckIn = today.toDate();
  await streak.save();

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
    alreadyCheckedIn: false,
    streak: streak.streak,
    coinsAdded: baseReward + milestoneBonus,
    milestoneBonus,
  };
}
