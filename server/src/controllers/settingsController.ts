import { Response } from 'express';
import { z } from 'zod';
import User from '../models/User';
import { AuthRequest } from '../middlewares/auth';
import {
  ALL_NETWORKS,
  isSupportedPayout,
  validateWalletAddress,
  type PayoutNetwork,
} from '../utils/validateWallet';
import { checkPayoutEligibility } from '../services/payoutService';
import { sendAddressChangedAlert } from '../services/notificationService';
import { logger } from '../utils/logger';

const UpdateSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  payoutCurrency: z.enum(['USDT', 'USDC']).optional(),
  usdtType: z.enum(ALL_NETWORKS as [PayoutNetwork, ...PayoutNetwork[]]).optional(),
  usdtAddress: z.string().trim().max(128).optional(),
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
  // Omitted currency means USDT — the only option older app builds know about.
  const payoutCurrency = parsed.data.payoutCurrency ?? 'USDT';

  if (usdtAddress && !usdtType) {
    return res.status(400).json({ message: `Select a network for your ${payoutCurrency} address` });
  }
  if (!usdtAddress && usdtType) {
    return res.status(400).json({ message: `Enter a ${payoutCurrency} address for that network` });
  }
  if (!usdtType && parsed.data.payoutCurrency) {
    return res.status(400).json({ message: 'Choose a network and address along with the currency' });
  }

  const update: Record<string, unknown> = {};
  if (theme) update.theme = theme;
  if (publicProfile !== undefined) update.publicProfile = publicProfile;

  let addressChanged = false;

  if (usdtType && usdtAddress) {
    if (!isSupportedPayout(payoutCurrency, usdtType)) {
      return res
        .status(400)
        .json({ message: `${payoutCurrency} payouts aren't supported on ${usdtType}` });
    }
    if (!validateWalletAddress(usdtType, usdtAddress)) {
      return res.status(400).json({ message: `That doesn't look like a valid ${usdtType} address` });
    }

    const current = await User.findById(req.userId)
      .select('usdtAddress usdtType payoutCurrency')
      .lean();

    // Switching coin on the same address is still a destination change — a
    // wrong-chain send is unrecoverable — so it restarts the hold too.
    addressChanged =
      current?.usdtAddress !== usdtAddress ||
      current?.usdtType !== usdtType ||
      (current?.payoutCurrency ?? 'USDT') !== payoutCurrency;

    if (addressChanged) {
      update.usdtAddress = usdtAddress;
      update.usdtType = usdtType;
      update.payoutCurrency = payoutCurrency;
      update.withdrawalEnabled = true;
      // Starts the cooling-off period. `checkPayoutEligibility` refuses to pay
      // out until it elapses, so a stolen session can't redirect prize money
      // and collect before the owner sees the alert below.
      update.usdtAddressChangedAt = new Date();
    }
  }

  // Re-saving an unchanged wallet is a no-op success, not an error.
  const walletResubmitted = !!(usdtType && usdtAddress);
  if (Object.keys(update).length === 0 && !walletResubmitted) {
    return res.status(400).json({ message: 'Nothing to update' });
  }

  const user = await User.findByIdAndUpdate(req.userId, update, {
    returnDocument: 'after',
  });

  if (addressChanged) {
    logger.warn('Payout address changed', {
      userId: req.userId,
      network: usdtType,
      currency: payoutCurrency,
      ip: req.ip,
    });
    // The account owner must hear about this even if they aren't the one who
    // did it — that's the whole point of the notification.
    sendAddressChangedAlert(req.userId, `${payoutCurrency} ${usdtType}`, usdtAddress as string).catch(
      (err) => logger.error('Address-change alert failed', err, { userId: req.userId }),
    );
  }

  const eligibility = await checkPayoutEligibility(req.userId);

  return res.json({
    settings: {
      theme: user?.theme,
      payoutCurrency: user?.payoutCurrency ?? 'USDT',
      usdtType: user?.usdtType,
      usdtAddress: user?.usdtAddress,
      withdrawalEnabled: !!user?.withdrawalEnabled,
      publicProfile: user?.publicProfile,
      usdtAddressChangedAt: user?.usdtAddressChangedAt ?? null,
    },
    // Same checklist the payout job applies, so the user can see exactly what
    // is still blocking them instead of being silently skipped.
    payoutEligibility: eligibility,
  });
}

/** GET /api/settings/payout-eligibility */
export async function getPayoutEligibility(req: AuthRequest, res: Response) {
  const eligibility = await checkPayoutEligibility(req.userId!);
  return res.json(eligibility);
}
