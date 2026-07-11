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
import { escapeRegex } from '../utils/escapeRegex';
import {
  checkAvatar,
  isTextOffensive,
  registerModerationStrike,
} from '../utils/moderation';

const OAuthSchema = z.object({
  provider: z.enum(['google', 'facebook']),
  token: z.string().min(10),
});

const IdentitySchema = z.object({
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(
      /^[a-zA-Z0-9_]+$/,
      'Username can only contain letters, numbers and underscores',
    ),
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

    if (user?.isBanned) {
      return res.status(403).json({ message: 'Account banned' });
    }

    // 2) Fallback by email (optional linking)
    if (!user) {
      user = await User.findOne({ email: profile.email });
      if (user) {
        if (user.provider && user.provider !== provider) {
          return res.status(409).json({
            message: 'Account already linked with another provider',
          });
        }
        user.provider = provider;
        user.providerId = profile.providerId;
        await user.save();
      }
    }

    const isNew = !user;

    // 3) Create user WITHOUT identity — identity must be set in /identity
    if (!user) {
      user = await User.create({
        email: profile.email,
        provider,
        providerId: profile.providerId,
        username: null,
        avatar: null,
        theme: 'system',
        withdrawalEnabled: false,
      });

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
 *
 * Fixes:
 * - Case-insensitive uniqueness check (so "Alice" and "alice" are treated as taken)
 * - Normalizes to lowercase before saving
 * - Returns a clear 409 with the specific conflict message
 * - Guards against referral-code collisions (referral codes are derived from username)
 */
export async function setIdentity(req: AuthRequest, res: Response) {
  if (!req.userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const parsed = IdentitySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: parsed.error.issues[0]?.message ?? 'Invalid payload',
    });
  }

  const username = normalizeUsername(parsed.data.username);
  const avatar = parsed.data.avatar.trim();

  // ── Moderation: offensive usernames / avatars are rejected and striked ────
  const avatarCheck = checkAvatar(avatar);
  if (avatarCheck.ok === false && avatarCheck.reason === 'invalid') {
    return res.status(400).json({
      message: 'Avatar must be one of the presets or a single emoji',
    });
  }
  if (isTextOffensive(username) || avatarCheck.ok === false) {
    const strike = await registerModerationStrike(
      req.userId,
      isTextOffensive(username) ? username : avatar,
    );
    return res
      .status(strike.banned ? 403 : 400)
      .json({ message: strike.message, strikes: strike.strikes });
  }

  try {
    // Case-insensitive exact match check — the DB index is on normalized lowercase
    // but we also guard against any legacy mixed-case usernames
    const exists = await User.findOne({
      username: { $regex: new RegExp(`^${escapeRegex(username)}$`, 'i') },
      _id: { $ne: req.userId },
    }).lean();

    if (exists) {
      return res.status(409).json({ message: 'Username is already taken' });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { username, avatar },
      { returnDocument: 'after' },
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json({ user: publicUser(user) });
  } catch (e: any) {
    // Mongo duplicate key error (race condition between the check and the write)
    if (e?.code === 11000) {
      return res.status(409).json({ message: 'Username is already taken' });
    }
    return res
      .status(500)
      .json({ message: e?.message || 'Failed to set identity' });
  }
}

/**
 * GET /api/auth/username-check?username=... (protected)
 *
 * Live availability + validity check for the identity screen, so users know
 * BEFORE submitting whether a name is free and allowed.
 */
export async function checkUsername(req: AuthRequest, res: Response) {
  const raw = typeof req.query.username === 'string' ? req.query.username : '';
  const username = normalizeUsername(raw);

  const validFormat = /^[a-z0-9_]{3,20}$/.test(username);
  if (!validFormat) {
    return res.json({ available: false, allowed: false, reason: 'invalid' });
  }

  // Report "not allowed" without striking — strikes only apply on actual
  // submission attempts, not while the user is still typing.
  if (isTextOffensive(username)) {
    return res.json({ available: false, allowed: false, reason: 'offensive' });
  }

  const exists = await User.findOne({
    username: { $regex: new RegExp(`^${escapeRegex(username)}$`, 'i') },
    _id: { $ne: req.userId },
  })
    .select('_id')
    .lean();

  return res.json({ available: !exists, allowed: true });
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
      publicProfile: user.publicProfile,
    },
  });
}
