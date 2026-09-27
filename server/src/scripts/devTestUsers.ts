/**
 * Two throwaway signed-in accounts for driving the app on simulators.
 *
 * Sign-in is Apple/Google OAuth, so there is otherwise no way to have two
 * accounts logged in at once to test a 1v1. Pairs with the __DEV__-only
 * dev-login route in the app.
 *
 *   npx ts-node src/scripts/devTestUsers.ts create
 *   npx ts-node src/scripts/devTestUsers.ts destroy
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import User from '../models/User';
import Progress from '../models/Progress';
import CoinWallet from '../models/CoinWallet';
import { issueSession } from '../utils/jwt';

const TAGS = ['devtester1', 'devtester2'];

async function main() {
  const mode = process.argv[2] ?? 'create';
  await mongoose.connect(process.env.MONGO_URI as string);

  if (mode === 'destroy') {
    const users = await User.find({ username: { $in: TAGS } }).select('_id').lean();
    const ids = users.map((u) => u._id);
    await Promise.all([
      Progress.deleteMany({ userId: { $in: ids } }),
      CoinWallet.deleteMany({ userId: { $in: ids } }),
      User.deleteMany({ _id: { $in: ids } }),
    ]);
    console.log(`removed ${ids.length} dev test users`);
    await mongoose.disconnect();
    return;
  }

  for (const tag of TAGS) {
    let user = await User.findOne({ username: tag });
    if (!user) {
      user = await User.create({
        email: `${tag}@pulsequiz.invalid`,
        provider: 'google',
        providerId: `devtest:${tag}`,
        username: tag,
        avatar: 'avatar0',
        hasCompletedFirstQuiz: true,
        publicProfile: false,
      });
      await Promise.all([
        Progress.create({ userId: user._id, points: 0 }),
        CoinWallet.create({ userId: user._id, coins: 1000 }),
      ]);
    }
    const { token } = issueSession(user._id.toString(), 0);
    console.log(`${tag}\t${token}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
