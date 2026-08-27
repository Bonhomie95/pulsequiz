import type { Request, Response } from 'express';
import { z } from 'zod';

import User, { type IUser } from '../models/User';
import Progress from '../models/Progress';
import CoinWallet from '../models/CoinWallet';
import Streak from '../models/Streak';
import PushToken from '../models/PushToken';

import { issueSession, verifyRefreshToken } from '../utils/jwt';
import { verifyGoogleIdToken } from '../services/oauth/google';
import { verifyFacebookAccessToken } from '../services/oauth/facebook';
import { verifyAppleIdentityToken } from '../services/oauth/apple';
import type { AuthRequest } from '../middlewares/auth';
import {
  checkAvatar,
  isTextOffensive,
  registerModerationStrike,
} from '../utils/moderation';
import { anonymiseUser } from '../services/accountService';
import { logger } from '../utils/logger';

const OAuthSchema = z.object({
  provider: z.enum(['google', 'facebook', 'apple']),
  token: z.string().min(10).max(4096),
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
  avatar: z.string().min(1).max(32),
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
 * Body: { provider: "google" | "facebook" | "apple", token: string }
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
        : provider === 'apple'
          ? await verifyAppleIdentityToken(token)
          : await verifyFacebookAccessToken(token);

    if (!profile?.email || !profile?.providerId) {
      return res.status(401).json({ message: 'OAuth profile invalid' });
    }

    // 1) Prefer provider match — this is the only stable identity.
    let user = await User.findOne({ provider, providerId: profile.providerId });

    if (user?.deletedAt) {
      return res.status(403).json({ message: 'This account has been deleted' });
    }
    if (user?.isBanned) {
      return res.status(403).json({ message: 'Account banned' });
    }

    // 2) Fall back to email so a returning user isn't duplicated.
    //
    // Only ever link a *provider-verified* email, and never one from Apple's
    // private relay or our Facebook fallback — those are synthesised and would
    // let an attacker claim someone else's account by controlling the address.
    if (!user && isLinkableEmail(profile.email)) {
      user = await User.findOne({ email: profile.email, deletedAt: null });
      if (user) {
        if (user.provider && user.provider !== provider) {
          return res.status(409).json({
            message: `This email is already registered with ${user.provider}. Sign in with ${user.provider} instead.`,
          });
        }
        user.provider = provider;
        user.providerId = profile.providerId;
        await user.save();
      }
    }

    const isNew = !user;

    // 3) Create the account WITHOUT identity — set in /identity.
    if (!user) {
      user = await User.create({
        email: profile.email,
        provider,
        providerId: profile.providerId,
        username: null,
        avatar: null,
        theme: 'system',
        withdrawalEnabled: false,
        tokenVersion: 0,
      });

      await Promise.all([
        Progress.create({ userId: user._id }),
        CoinWallet.create({ userId: user._id }),
        Streak.create({ userId: user._id }),
      ]);

      logger.info('New account created', { provider, userId: user._id.toString() });
    }

    const session = issueSession(user._id.toString(), user.tokenVersion ?? 0);

    return res.json({
      ...session,
      user: publicUser(user),
      needsIdentity: isIdentityMissing(user),
      isNew,
    });
  } catch (e: any) {
    logger.warn('OAuth login failed', { provider, error: e?.message });
    return res.status(401).json({ message: 'Sign-in failed. Please try again.' });
  }
}

/** Synthetic addresses must never be used to link an existing account. */
function isLinkableEmail(email: string): boolean {
  return !email.endsWith('@pulsequiz.local');
}

/**
 * POST /api/auth/refresh
 * Body: { refreshToken }
 *
 * Exchanges a refresh token for a fresh access token. Access tokens are now
 * 30 days rather than the previous ten years, so this is what keeps a user
 * signed in without leaving a decade-long bearer credential on the device.
 */
export async function refresh(req: Request, res: Response) {
  const refreshToken =
    typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : '';
  if (!refreshToken) return res.status(400).json({ message: 'refreshToken required' });

  let claims;
  try {
    claims = verifyRefreshToken(refreshToken);
  } catch {
    return res.status(401).json({ message: 'Invalid refresh token' });
  }

  const user = await User.findById(claims.userId)
    .select('tokenVersion isBanned deletedAt username avatar email')
    .lean();

  if (!user || user.deletedAt) return res.status(401).json({ message: 'Unauthorized' });
  if ((user.tokenVersion ?? 0) !== claims.tv) {
    return res.status(401).json({ message: 'Session expired' });
  }
  if (user.isBanned) return res.status(403).json({ message: 'Account banned' });

  const session = issueSession(user._id.toString(), user.tokenVersion ?? 0);
  return res.json({ ...session, user: publicUser(user as any) });
}

/**
 * POST /api/auth/logout
 *
 * Bumps the token version, which invalidates every outstanding access and
 * refresh token for this account. Logout previously only cleared the device;
 * a copied token stayed valid for its full (ten-year) lifetime.
 */
export async function logout(req: AuthRequest, res: Response) {
  await User.updateOne({ _id: req.userId }, { $inc: { tokenVersion: 1 } });
  await PushToken.updateMany({ userId: req.userId }, { $set: { active: false } });
  return res.json({ ok: true });
}

/**
 * DELETE /api/auth/account
 * Body: { confirm: "DELETE" }
 *
 * Required by both app stores when an app supports account creation. The row
 * is anonymised rather than dropped so the coin ledger and payout history stay
 * referentially intact for accounting and dispute resolution.
 */
export async function deleteAccount(req: AuthRequest, res: Response) {
  if (req.body?.confirm !== 'DELETE') {
    return res.status(400).json({ message: 'Send { "confirm": "DELETE" } to confirm' });
  }

  const summary = await anonymiseUser(req.userId!);

  logger.warn('Account deleted by user', { userId: req.userId, ...summary });

  return res.json({
    ok: true,
    message: 'Your account has been deleted.',
    removed: summary,
  });
}

/**
 * GET /api/auth/export  — GDPR data access.
 * Returns everything we hold about the caller, as JSON.
 */
export async function exportMyData(req: AuthRequest, res: Response) {
  const { buildUserExport } = await import('../services/accountService');
  const data = await buildUserExport(req.userId!);

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="pulsequiz-data.json"');
  return res.send(JSON.stringify(data, null, 2));
}

/**
 * POST /api/auth/identity (protected)
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
    // Plain equality against the collated `username_ci` index. The previous
    // case-insensitive regex could not use an index and scanned the whole
    // collection — on a per-keystroke endpoint.
    const exists = await User.findOne({ username, _id: { $ne: req.userId } })
      .collation({ locale: 'en', strength: 2 })
      .select('_id')
      .lean();

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
    // Duplicate key = we lost the race between the check and the write.
    if (e?.code === 11000) {
      return res.status(409).json({ message: 'Username is already taken' });
    }
    throw e;
  }
}

/**
 * GET /api/auth/username-check?username=... (protected)
 */
export async function checkUsername(req: AuthRequest, res: Response) {
  const raw = typeof req.query.username === 'string' ? req.query.username : '';
  const username = normalizeUsername(raw);

  const validFormat = /^[a-z0-9_]{3,20}$/.test(username);
  if (!validFormat) {
    return res.json({ available: false, allowed: false, reason: 'invalid' });
  }

  if (isTextOffensive(username)) {
    return res.json({ available: false, allowed: false, reason: 'offensive' });
  }

  const exists = await User.findOne({ username, _id: { $ne: req.userId } })
    .collation({ locale: 'en', strength: 2 })
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

  // Silently retire a pre-versioning token. Those were signed with a ten-year
  // expiry and no version claim, so bumping tokenVersion cannot revoke them —
  // the only way to get rid of them is to replace them. The client stores the
  // new pair on its next app open and the old token stops being used.
  const session = req.legacyToken
    ? issueSession(user._id.toString(), user.tokenVersion ?? 0)
    : null;

  if (session) {
    logger.info('Upgraded a legacy session token', { userId: req.userId });
  }

  return res.json({
    ...(session ?? {}),
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
      provider: user.provider,
    },
  });
}
