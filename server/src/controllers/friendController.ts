import { Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';

import { AuthRequest } from '../middlewares/auth';
import Friend, { IFriend } from '../models/Friend';
import User from '../models/User';
import Progress from '../models/Progress';
import QuizSession from '../models/QuizSession';
import LeaderboardSnapshot from '../models/LeaderboardSnapshot';
import ActiveQuizSession from '../models/ActiveQuizSession';
import PvPMatch from '../models/PvPMatch';
import {
  sendFriendAcceptedNotification,
  sendFriendRequestNotification,
} from '../services/notificationService';
import { logger } from '../utils/logger';

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;
const IN_GAME_STATES = ['MATCHED', 'ACTIVE', 'WAITING_ON_OPPONENT'] as const;

const TargetSchema = z.object({
  userId: z.string().refine(Types.ObjectId.isValid, 'Invalid user id'),
});

const FriendIdSchema = z.object({
  friendId: z.string().refine(Types.ObjectId.isValid, 'Invalid request id'),
});

/** Who is mid-game right now, from the two places a game can live. */
async function loadInGame(ids: Types.ObjectId[]): Promise<Set<string>> {
  const [solo, pvp] = await Promise.all([
    ActiveQuizSession.find({ userId: { $in: ids }, finished: false })
      .select('userId')
      .lean(),
    PvPMatch.find({
      'players.userId': { $in: ids },
      state: { $in: IN_GAME_STATES },
      settledAt: null,
    })
      .select('players.userId')
      .lean(),
  ]);

  const inGame = new Set(solo.map((s) => s.userId.toString()));
  for (const match of pvp) {
    for (const player of (match as any).players ?? []) {
      inGame.add(player.userId.toString());
    }
  }
  return inGame;
}

function isOnline(lastSeenAt: Date | null | undefined, now: number): boolean {
  return lastSeenAt != null && now - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS;
}

// ─── searchUsers ─────────────────────────────────────────────────────────────

export async function searchUsers(req: AuthRequest, res: Response) {
  const raw = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (raw.length < 3) {
    return res.status(400).json({ message: 'Type at least 3 characters to search' });
  }
  if (raw.length > 20) {
    return res.status(400).json({ message: 'That search is too long' });
  }

  // Usernames are stored lowercase, so lowercasing the query lets us drop the
  // 'i' flag — a case-insensitive regex cannot use an index, an anchored
  // case-sensitive one can.
  const prefix = raw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const users = await User.find({
    username: { $regex: `^${prefix}` },
    // Banned and deleted accounts must not be discoverable.
    isBanned: { $ne: true },
    deletedAt: null,
    _id: { $ne: req.userId },
  })
    .select('username avatar publicProfile lastSeenAt')
    .limit(20)
    .lean();

  if (!users.length) return res.json({ users: [] });

  const userOids = users.map((u) => u._id);
  const userIds = userOids.map((id) => id.toString());

  const [friendships, progressDocs, sessionCounts, allSnapshot, inGame] =
    await Promise.all([
      Friend.find({
        $or: [
          { requesterId: req.userId, recipientId: { $in: userOids } },
          { requesterId: { $in: userOids }, recipientId: req.userId },
        ],
      }).lean(),
      Progress.find({ userId: { $in: userOids } })
        .select('userId level')
        .lean(),
      // NOTE: an aggregation $match is NOT cast against the schema the way
      // find() is, so these must be real ObjectIds. Passing strings here
      // silently matched nothing and every user showed 0 sessions played.
      QuizSession.aggregate<{ _id: Types.ObjectId; count: number }>([
        { $match: { userId: { $in: userOids } } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
      ]),
      LeaderboardSnapshot.findOne({ type: 'all' }).select('data').lean(),
      loadInGame(userOids),
    ]);

  const statusMap = new Map<string, string>();
  for (const f of friendships as IFriend[]) {
    const otherId =
      f.requesterId.toString() === req.userId
        ? f.recipientId.toString()
        : f.requesterId.toString();
    const status =
      f.status === 'accepted'
        ? 'accepted'
        : f.status === 'blocked'
          ? 'blocked'
          : f.status === 'declined'
            ? 'none' // a decline is not permanent — they may ask again
            : f.requesterId.toString() === req.userId
              ? 'pending_sent'
              : 'pending_received';
    statusMap.set(otherId, status);
  }

  const levelMap = new Map(
    progressDocs.map((p) => [p.userId.toString(), (p as any).level]),
  );
  const sessionMap = new Map(
    sessionCounts.map((s) => [s._id.toString(), s.count]),
  );

  const rankMap = new Map<string, number>();
  for (const [idx, entry] of ((allSnapshot?.data ?? []) as { userId: string }[]).entries()) {
    rankMap.set(entry.userId.toString(), idx + 1);
  }

  const now = Date.now();

  return res.json({
    users: users
      // Someone who blocked you shouldn't surface in your search results.
      .filter((u) => statusMap.get(u._id.toString()) !== 'blocked')
      .map((u) => {
        const uid = u._id.toString();
        return {
          _id: uid,
          username: u.username,
          avatar: u.avatar,
          friendStatus: statusMap.get(uid) ?? 'none',
          level: levelMap.get(uid) ?? 1,
          totalSessions: sessionMap.get(uid) ?? 0,
          allTimeRank: rankMap.get(uid) ?? null,
          isOnline: isOnline(u.lastSeenAt, now),
          isInGame: inGame.has(uid),
          isReadyToPlay: !!u.publicProfile,
        };
      }),
  });
}

// ─── sendFriendRequest ────────────────────────────────────────────────────────

export async function sendFriendRequest(req: AuthRequest, res: Response) {
  const target = req.body?.targetUserId ?? req.body?.userId;
  const parsed = TargetSchema.safeParse({ userId: target });
  if (!parsed.success) {
    return res.status(400).json({ message: 'Pick someone to add' });
  }

  const recipientId = parsed.data.userId;
  if (recipientId === req.userId) {
    return res.status(400).json({ message: "You can't add yourself" });
  }

  const recipient = await User.findById(recipientId)
    .select('username isBanned deletedAt')
    .lean();
  if (!recipient || recipient.deletedAt || recipient.isBanned) {
    return res.status(404).json({ message: 'That player is no longer available' });
  }

  const existing = await Friend.findOne({
    $or: [
      { requesterId: req.userId, recipientId },
      { requesterId: recipientId, recipientId: req.userId },
    ],
  });

  if (existing) {
    if (existing.status === 'blocked') {
      // Don't confirm the block — that just tells them they were blocked.
      return res.status(403).json({ message: 'Unable to send friend request' });
    }
    if (existing.status === 'accepted') {
      return res.status(400).json({ message: "You're already friends" });
    }
    if (existing.status === 'pending') {
      // If they already asked us, treat this as accepting.
      if (existing.recipientId.toString() === req.userId) {
        existing.status = 'accepted';
        await existing.save();
        return res.json({ ok: true, status: 'accepted' });
      }
      return res.status(400).json({ message: 'Request already sent' });
    }

    // A previous decline must not lock the pair out forever — reopen it,
    // normalised so the new asker is the requester.
    existing.status = 'pending';
    (existing as any).requesterId = new Types.ObjectId(req.userId);
    (existing as any).recipientId = new Types.ObjectId(recipientId);
    await existing.save();
  } else {
    try {
      await Friend.create({ requesterId: req.userId, recipientId });
    } catch (err: any) {
      // Lost a race against a concurrent request in the other direction.
      if (err?.code === 11000) {
        return res.status(400).json({ message: 'Request already exists' });
      }
      throw err;
    }
  }

  const sender = await User.findById(req.userId).select('username').lean();
  if (sender?.username) {
    sendFriendRequestNotification(recipientId, sender.username).catch((err) =>
      logger.error('Friend request notification failed', err),
    );
  }

  return res.json({ ok: true, status: 'pending' });
}

// ─── Responding to a request ──────────────────────────────────────────────────

/**
 * Accept or decline, claimed atomically so a double-tap can't both accept and
 * decline the same request depending on which write lands last.
 */
async function resolveRequest(
  userId: string,
  friendId: string,
  accept: boolean,
): Promise<{ ok: boolean; status?: string; error?: string }> {
  const request = await Friend.findOneAndUpdate(
    { _id: friendId, recipientId: userId, status: 'pending' },
    { $set: { status: accept ? 'accepted' : 'declined' } },
    { returnDocument: 'after' },
  );

  if (!request) return { ok: false, error: 'Friend request not found' };

  if (accept) {
    const accepter = await User.findById(userId).select('username').lean();
    if (accepter?.username) {
      sendFriendAcceptedNotification(
        request.requesterId.toString(),
        accepter.username,
      ).catch((err) => logger.error('Friend accepted notification failed', err));
    }
  }

  return { ok: true, status: request.status };
}

export async function respondToRequest(req: AuthRequest, res: Response) {
  const parsed = FriendIdSchema.safeParse({ friendId: req.params.friendId });
  if (!parsed.success) return res.status(400).json({ message: 'Invalid request id' });

  const result = await resolveRequest(req.userId!, parsed.data.friendId, !!req.body?.accept);
  if (!result.ok) return res.status(404).json({ message: result.error });
  return res.json({ ok: true, status: result.status });
}

export async function acceptRequest(req: AuthRequest, res: Response) {
  const parsed = FriendIdSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid request id' });

  const result = await resolveRequest(req.userId!, parsed.data.friendId, true);
  if (!result.ok) return res.status(404).json({ message: result.error });
  return res.json({ ok: true, status: 'accepted' });
}

export async function declineRequest(req: AuthRequest, res: Response) {
  const parsed = FriendIdSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid request id' });

  const result = await resolveRequest(req.userId!, parsed.data.friendId, false);
  if (!result.ok) return res.status(404).json({ message: result.error });
  return res.json({ ok: true, status: 'declined' });
}

// ─── unfriendUser ─────────────────────────────────────────────────────────────

export async function unfriendUser(req: AuthRequest, res: Response) {
  const parsed = TargetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid user id' });

  const targetId = parsed.data.userId;

  const result = await Friend.deleteOne({
    status: 'accepted',
    $or: [
      { requesterId: req.userId, recipientId: targetId },
      { requesterId: targetId, recipientId: req.userId },
    ],
  });

  if (result.deletedCount === 0) {
    return res.status(404).json({ message: "You aren't friends with that player" });
  }

  return res.json({ ok: true });
}

// ─── blockUser ────────────────────────────────────────────────────────────────

export async function blockUser(req: AuthRequest, res: Response) {
  const parsed = TargetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid user id' });

  const targetId = parsed.data.userId;
  if (targetId === req.userId) {
    return res.status(400).json({ message: "You can't block yourself" });
  }

  // The unique index is on (requesterId, recipientId) in one direction, so a
  // pair can legitimately have a row each way. Clear both, then write a single
  // canonical block with the blocker as requester — otherwise "normalising the
  // direction" on an existing row could collide with its mirror.
  await Friend.deleteMany({
    $or: [
      { requesterId: req.userId, recipientId: targetId },
      { requesterId: targetId, recipientId: req.userId },
    ],
  });

  await Friend.create({
    requesterId: req.userId,
    recipientId: targetId,
    status: 'blocked',
  });

  return res.json({ ok: true });
}

export async function unblockUser(req: AuthRequest, res: Response) {
  const parsed = TargetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid user id' });

  const result = await Friend.deleteOne({
    requesterId: req.userId,
    recipientId: parsed.data.userId,
    status: 'blocked',
  });

  if (result.deletedCount === 0) {
    return res.status(404).json({ message: "You haven't blocked that player" });
  }

  return res.json({ ok: true });
}

// ─── getMyFriends ─────────────────────────────────────────────────────────────

export async function getMyFriends(req: AuthRequest, res: Response) {
  const friends = (await Friend.find({
    status: 'accepted',
    $or: [{ requesterId: req.userId }, { recipientId: req.userId }],
  }).lean()) as IFriend[];

  const ids = friends.map((f) =>
    f.requesterId.toString() === req.userId ? f.recipientId : f.requesterId,
  );

  if (!ids.length) return res.json({ friends: [] });

  const [users, inGame] = await Promise.all([
    User.find({ _id: { $in: ids }, deletedAt: null })
      .select('username avatar publicProfile lastSeenAt')
      .lean(),
    loadInGame(ids as Types.ObjectId[]),
  ]);

  const now = Date.now();

  return res.json({
    friends: users.map((u) => {
      const uid = u._id.toString();
      return {
        _id: uid,
        username: u.username,
        avatar: u.avatar,
        isOnline: isOnline(u.lastSeenAt, now),
        isInGame: inGame.has(uid),
        isReadyToPlay: !!u.publicProfile,
      };
    }),
  });
}

// ─── getPendingRequests ───────────────────────────────────────────────────────

export async function getPendingRequests(req: AuthRequest, res: Response) {
  const requests = (await Friend.find({
    recipientId: req.userId,
    status: 'pending',
  })
    .sort({ createdAt: -1 })
    .lean()) as IFriend[];

  if (!requests.length) return res.json({ requests: [] });

  const users = await User.find({
    _id: { $in: requests.map((r) => r.requesterId) },
    deletedAt: null,
  })
    .select('username avatar lastSeenAt')
    .lean();

  // Join on id, NOT array position. Mongo does not promise that a $in query
  // returns documents in the order of the input array, and a since-deleted
  // requester makes the two arrays different lengths — the previous
  // index-based zip attached each request id to whichever user happened to
  // land in that slot, so accepting one request could befriend someone else.
  const userById = new Map(users.map((u) => [u._id.toString(), u]));
  const now = Date.now();

  return res.json({
    requests: requests
      .map((r) => {
        const u = userById.get(r.requesterId.toString());
        if (!u) return null; // requester deleted their account
        return {
          _id: u._id.toString(),
          username: u.username,
          avatar: u.avatar,
          isOnline: isOnline(u.lastSeenAt, now),
          friendId: r._id.toString(),
          requestedAt: (r as any).createdAt,
        };
      })
      .filter(Boolean),
  });
}
