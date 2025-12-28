import { Request, Response } from 'express';
import { z } from 'zod';
import User from '../models/User';
import Progress from '../models/Progress';
import CoinWallet from '../models/CoinWallet';
import Streak from '../models/Streak';
import { signJwt } from '../utils/jwt';
import { verifyGoogleIdToken } from '../services/oauth/google';
import { verifyFacebookAccessToken } from '../services/oauth/facebook';
import { AuthRequest } from '../middlewares/auth';

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

function normalizeUsername(raw: string) {
  return raw.trim().replace(/\s+/g, '_').toLowerCase();
}

function generateFallbackUsername(nameOrEmail: string) {
  const base = normalizeUsername(nameOrEmail.split('@')[0] || 'player');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${base}_${rand}`;
}

export async function oauthLogin(req: Request, res: Response) {
  const parsed = OAuthSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ message: 'Invalid payload' });

  const { provider, token } = parsed.data;

  try {
    const profile =
      provider === 'google'
        ? await verifyGoogleIdToken(token)
        : await verifyFacebookAccessToken(token);

    // find user by provider id first
    let user = await User.findOne({ provider, providerId: profile.providerId });

    // else fallback by email (optional)
    if (!user) user = await User.findOne({ email: profile.email });

    const isNew = !user;

    if (!user) {
      // Create user with temporary username/avatar; identity screen will finalize
      const tempUsername = generateFallbackUsername(
        profile.name || profile.email
      );
      user = await User.create({
        email: profile.email,
        provider,
        providerId: profile.providerId,
        username: tempUsername,
        avatar: profile.picture || 'default',
      });

      await Progress.create({ userId: user._id });
      await CoinWallet.create({ userId: user._id });
      await Streak.create({ userId: user._id });
    } else {
      // Ensure provider fields are populated (if user existed by email)
      if (!user.provider || !user.providerId) {
        user.provider = provider as any;
        user.providerId = profile.providerId;
        await user.save();
      }
    }

    const jwt = signJwt({ userId: user._id.toString() });

    // if username/avatar still "temporary" or not chosen, frontend should route to Identity
    // Simple rule: avatar === 'default' OR username endswith _4digits (fallback)
    const needsIdentity =
      user.avatar === 'default' || /_\d{4}$/.test(user.username);

    return res.json({
      token: jwt,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
      },
      needsIdentity,
      isNew,
    });
  } catch (e: any) {
    return res.status(401).json({ message: e?.message || 'OAuth failed' });
  }
}

export async function setIdentity(req: AuthRequest, res: Response) {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized' });

  const parsed = IdentitySchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ message: 'Invalid payload' });

  const username = normalizeUsername(parsed.data.username);
  const { avatar } = parsed.data;

  const exists = await User.findOne({ username });
  if (exists) return res.status(409).json({ message: 'Username taken' });

  const user = await User.findByIdAndUpdate(
    req.userId,
    { username, avatar },
    { new: true }
  );

  return res.json({
    user: {
      id: user?._id,
      email: user?.email,
      username: user?.username,
      avatar: user?.avatar,
    },
  });
}

export async function me(req: AuthRequest, res: Response) {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized' });

  const user = await User.findById(req.userId).lean();
  if (!user) return res.status(404).json({ message: 'User not found' });

  return res.json({
    user: {
      id: user._id,
      email: user.email,
      username: user.username,
      avatar: user.avatar,
    },
  });
}
