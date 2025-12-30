import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import CoinWallet from '../models/CoinWallet';

export async function getWallet(req: AuthRequest, res: Response) {
  if (!req.userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const wallet = await CoinWallet.findOne({ userId: req.userId });

  res.json(wallet || { coins: 0 });
}
