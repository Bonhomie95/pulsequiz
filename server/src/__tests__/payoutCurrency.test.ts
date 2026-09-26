/**
 * USDC payouts: the wallet settings accept a currency, reject unsupported
 * (currency, network) pairs, and the provider ticker matches the choice.
 */
import request from 'supertest';
import type { Express } from 'express';

import User from '../models/User';
import { initDefaultSettings } from '../models/AppSettings';
import { issueSession } from '../utils/jwt';
import { getCurrency } from '../services/nowpaymentsService';
import { validateWalletAddress } from '../utils/validateWallet';

let app: Express;
let token: string;
let userId: string;

const EVM = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
const SOL = '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV';

beforeAll(async () => {
  process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
  ({ default: app } = await import('../app'));
});

beforeEach(async () => {
  await initDefaultSettings();
  const user = await User.create({
    email: 'wallet@example.com',
    provider: 'google',
    providerId: 'wallet-1',
    username: 'walletplayer',
    avatar: 'avatar0',
  });
  userId = user._id.toString();
  ({ token } = issueSession(userId, 0));
});

const patch = (body: object) =>
  request(app).patch('/api/settings').set('Authorization', `Bearer ${token}`).send(body);

describe('payout currency', () => {
  it('defaults to USDT when an older client omits the currency', async () => {
    const res = await patch({ usdtType: 'ERC20', usdtAddress: EVM }).expect(200);
    expect(res.body.settings.payoutCurrency).toBe('USDT');
  });

  it('saves a USDC wallet on a supported network and restarts the hold', async () => {
    const res = await patch({ payoutCurrency: 'USDC', usdtType: 'SOL', usdtAddress: SOL }).expect(200);
    expect(res.body.settings).toMatchObject({ payoutCurrency: 'USDC', usdtType: 'SOL' });
    const user = await User.findById(userId).lean();
    expect(user?.usdtAddressChangedAt).toBeTruthy();
  });

  it('switching coin on the same address counts as a change', async () => {
    await patch({ payoutCurrency: 'USDT', usdtType: 'ERC20', usdtAddress: EVM }).expect(200);
    await User.updateOne({ _id: userId }, { usdtAddressChangedAt: new Date(0) });
    await patch({ payoutCurrency: 'USDC', usdtType: 'ERC20', usdtAddress: EVM }).expect(200);
    const user = await User.findById(userId).lean();
    expect(user?.payoutCurrency).toBe('USDC');
    expect(user?.usdtAddressChangedAt!.getTime()).toBeGreaterThan(0);
  });

  it('rejects unsupported pairs and garbage currencies', async () => {
    await patch({ payoutCurrency: 'USDC', usdtType: 'TRC20', usdtAddress: 'TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9' }).expect(400);
    await patch({ payoutCurrency: 'USDT', usdtType: 'SOL', usdtAddress: SOL }).expect(400);
    await patch({ payoutCurrency: 'DAI', usdtType: 'ERC20', usdtAddress: EVM }).expect(400);
    await patch({ payoutCurrency: 'USDC' }).expect(400);
  });

  it('maps every supported pair to a provider ticker and refuses the rest', () => {
    expect(getCurrency('USDT', 'TRC20')).toBe('usdttrc20');
    expect(getCurrency('USDC', 'ERC20')).toBe('usdc');
    expect(getCurrency('USDC', 'POLYGON')).toBe('usdcmatic');
    expect(getCurrency('USDC', 'SOL')).toBe('usdcsol');
    expect(() => getCurrency('USDC', 'TRC20')).toThrow();
  });

  it('validates addresses per network', () => {
    expect(validateWalletAddress('SOL', SOL)).toBe(true);
    expect(validateWalletAddress('SOL', EVM)).toBe(false);
    expect(validateWalletAddress('POLYGON', EVM)).toBe(true);
  });
});
