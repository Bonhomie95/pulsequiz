import type { Request, Response } from 'express';
import { z } from 'zod';

import User, { type IUser } from '../models/User';
import Progress from '../models/Progress';
import CoinWallet from '../models/CoinWallet';
import Streak from '../models/Streak';

import { signJwt } from '../utils/jwt';
import { verifyGoogleIdToken } from '../services/oauth/google';
import { verifyFacebookAccessToken } from '../services/oauth/facebook';
import type { AuthRequest } from '../middlewares/auth';

const OAuthSchema = z.object({
  provider: z.enum(['google', 'facebook']),
  token: z.string().min(10),
});

const IdentitySchema = z.object({
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/),
  avatar: z.string().min(1),
});

type OAuthProfile = {
  providerId: string;
  email: string;
  name?: string | null;
};

function normalizeUsername(raw: string) {
  return raw.trim().replace(/\s+/g, '_').toLowerCase();
}

function isIdentityMissing(user: Pick<IUser, 'username' | 'avatar'>) {
  return !user.username || !user.avatar;
}

function publicUser(u: Pick<IUser, '_id' | 'email' | 'username' | 'avatar'>) {
  return {
    id: u._id.toString(),
    email: u.email,
    username: u.username ?? null,
    avatar: u.avatar ?? null,
  };
}

/**
 * POST /api/auth/oauth
 * Body: { provider: "google" | "facebook", token: string }
 */
export async function oauthLogin(req: Request, res: Response) {
  const parsed = OAuthSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid payload' });
  }

  const { provider, token } = parsed.data;

  try {
    const profile: OAuthProfile =
      provider === 'google'
        ? await verifyGoogleIdToken(token)
        : await verifyFacebookAccessToken(token);

    if (!profile?.email || !profile?.providerId) {
      return res.status(401).json({ message: 'OAuth profile invalid' });
    }

    // 1) Prefer provider match
    let user = await User.findOne({ provider, providerId: profile.providerId });

    // 2) Fallback by email (optional linking)
    if (!user) {
      user = await User.findOne({ email: profile.email });
      if (user) {
        // If the email exists but is linked to a different provider → block
        if (user.provider && user.provider !== provider) {
          return res.status(409).json({
            message: 'Account already linked with another provider',
          });
        }

        // Link provider if missing / incomplete
        user.provider = provider;
        user.providerId = profile.providerId;
        await user.save();
      }
    }

    const isNew = !user;

    // 3) Create user WITHOUT identity
    if (!user) {
      user = await User.create({
        email: profile.email,
        provider,
        providerId: profile.providerId,

        // ✅ identity must be set later in /identity
        username: null,
        avatar: null,

        // optional defaults
        theme: 'system',
        withdrawalEnabled: false,
      });
    

      // create companion docs (safe to ignore duplicates if you re-run)
      await Promise.all([
        Progress.create({ userId: user._id }),
        CoinWallet.create({ userId: user._id }),
        Streak.create({ userId: user._id }),
      ]);
    }

    const jwt = signJwt({ userId: user._id.toString() });

    const needsIdentity = isIdentityMissing(user);

    return res.json({
      token: jwt,
      user: publicUser(user),
      needsIdentity,
      isNew,
    });
  } catch (e: any) {
    return res.status(401).json({ message: e?.message || 'OAuth failed' });
  }
}

/**
 * POST /api/auth/identity (protected)
 * Body: { username, avatar }
 */
export async function setIdentity(req: AuthRequest, res: Response) {
  if (!req.userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const parsed = IdentitySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid payload' });
  }

  const username = normalizeUsername(parsed.data.username);
  const avatar = parsed.data.avatar;

  try {
    // unique check
    const exists = await User.findOne({
      username,
      _id: { $ne: req.userId },
    }).lean();

    if (exists) {
      return res.status(409).json({ message: 'Username taken' });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { username, avatar },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json({
      user: publicUser(user),
    });
  } catch (e: any) {
    return res
      .status(500)
      .json({ message: e?.message || 'Failed to set identity' });
  }
}

/**
 * GET /api/auth/me (protected)
 */
export async function me(req: AuthRequest, res: Response) {
  if (!req.userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const user = await User.findById(req.userId).lean();
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  return res.json({
    user: {
      id: user._id.toString(),
      email: user.email,
      username: user.username ?? null,
      avatar: user.avatar ?? null,
      theme: user.theme,
      usdtType: user.usdtType ?? null,
      usdtAddress: user.usdtAddress ?? null,
      withdrawalEnabled: !!user.withdrawalEnabled,
    },
  });
}
