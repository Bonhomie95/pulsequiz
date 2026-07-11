import { Response } from 'express';
import { z } from 'zod';
import User from '../models/User';
import { AuthRequest } from '../middlewares/auth';
import { validateUsdtAddress } from '../utils/validateWallet';

const UpdateSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  usdtType: z.enum(['TRC20', 'ERC20', 'BEP20']).optional(),
  usdtAddress: z.string().optional(),
  publicProfile: z.boolean().optional(),
});

export async function updateSettings(req: AuthRequest, res: Response) {
  if (!req.userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const parsed = UpdateSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid payload' });
  }

  const { theme, usdtType, usdtAddress, publicProfile } = parsed.data;

  if (usdtAddress && !usdtType) {
    return res.status(400).json({
      message: 'USDT type required when setting address',
    });
  }

  if (!usdtAddress && usdtType) {
    return res.status(400).json({
      message: 'USDT address required when setting address',
    });
  }

  if (usdtType && usdtAddress) {
    const valid = validateUsdtAddress(usdtType, usdtAddress);
    if (!valid) {
      return res.status(400).json({
        message: `Invalid ${usdtType} address`,
      });
    }
  }

  const update: any = {};
  if (theme) update.theme = theme;
  if (publicProfile !== undefined) update.publicProfile = publicProfile;

  if (usdtType) update.usdtType = usdtType;
  if (usdtAddress) {
    update.usdtAddress = usdtAddress;
    update.withdrawalEnabled = true; // 🔐 unlock withdrawals later
  }

  const user = await User.findByIdAndUpdate(req.userId, update, {
    returnDocument: 'after',
  });

  return res.json({
    settings: {
      theme: user?.theme,
      usdtType: user?.usdtType,
      usdtAddress: user?.usdtAddress,
      withdrawalEnabled: user?.withdrawalEnabled,
      publicProfile: user?.publicProfile,
    },
  });
}
