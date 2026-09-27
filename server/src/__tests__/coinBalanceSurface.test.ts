/**
 * The balance a player sees must be the balance they have.
 *
 * Renaming the currency to PulseCoins in user-facing copy also rewrote the
 * string inside `CoinWallet.findOne().select('coins')` — a Mongo projection,
 * not a label. The query then returned a document with no `coins` field, so
 * `wallet?.coins ?? 0` read zero and every player's balance showed as empty
 * while the wallets themselves were untouched.
 *
 * These read through the real surfaces, so a projection that stops returning
 * the field fails here rather than on someone's home screen.
 */
import CoinWallet from '../models/CoinWallet';
import Progress from '../models/Progress';
import User from '../models/User';
import { initDefaultSettings } from '../models/AppSettings';
import { getHomeSummary } from '../controllers/homeController';
import { getBalance } from '../services/coinService';

function res() {
  const out: any = { statusCode: 200, body: null };
  out.status = (c: number) => { out.statusCode = c; return out; };
  out.json = (b: any) => { out.body = b; return out; };
  return out;
}

let userId: string;

beforeEach(async () => {
  await initDefaultSettings();
  const u = await User.create({
    email: 'bal@example.com', provider: 'google', providerId: 'bal-1',
    username: 'balance', avatar: 'avatar0',
  });
  userId = u._id.toString();
  await Promise.all([
    Progress.create({ userId: u._id, points: 120 }),
    CoinWallet.create({ userId: u._id, coins: 275 }),
  ]);
});

it('reports the real balance on the home payload', async () => {
  const r = res();
  await getHomeSummary({ userId } as any, r as any);

  expect(r.statusCode).toBe(200);
  expect(r.body.coins).toBe(275);
});

it('agrees with the wallet service', async () => {
  expect(await getBalance(userId)).toBe(275);
});
