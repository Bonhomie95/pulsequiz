import { Response } from 'express';
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

// ─── searchUsers ─────────────────────────────────────────────────────────────

export async function searchUsers(req: AuthRequest, res: Response) {
  const { q } = req.query;
  if (!q || typeof q !== 'string' || q.trim().length < 3) {
    return res
      .status(400)
      .json({ message: 'Query must be at least 3 characters' });
  }

  const users = await User.find({
    $and: [
      { username: { $ne: null } },
      {
        username: {
          $regex: new RegExp(
            `^${q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
            'i',
          ),
        },
      },
    ],
    _id: { $ne: req.userId },
  })
    .select('username avatar publicProfile lastSeenAt')
    .limit(20)
    .lean();

  const userIds = users.map((u) => u._id.toString());
  const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

  const [
    friendships,
    progressDocs,
    sessionCounts,
    allSnapshot,
    activeSoloSessions,
    activePvpMatches,
  ] = await Promise.all([
    Friend.find({
      $or: [
        { requesterId: req.userId, recipientId: { $in: userIds } },
        { requesterId: { $in: userIds }, recipientId: req.userId },
      ],
    }).lean(),
    Progress.find({ userId: { $in: userIds } })
      .select('userId level')
      .lean(),
    QuizSession.aggregate<{ _id: string; count: number }>([
      { $match: { userId: { $in: userIds } } },
      { $group: { _id: '$userId', count: { $sum: 1 } } },
    ]),
    LeaderboardSnapshot.findOne({ type: 'all' }).select('data').lean(),
    ActiveQuizSession.find({ userId: { $in: userIds }, finished: false })
      .select('userId')
      .lean(),
    PvPMatch.find({
      'players.userId': { $in: userIds },
      state: { $in: ['MATCHED', 'ACTIVE', 'WAITING_ON_OPPONENT'] },
    })
      .select('players.userId')
      .lean(),
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
  if (allSnapshot?.data) {
    (allSnapshot.data as Array<{ userId: string }>).forEach((entry, idx) => {
      rankMap.set(entry.userId.toString(), idx + 1);
    });
  }

  const inGameSolo = new Set(
    activeSoloSessions.map((s) => s.userId.toString()),
  );
  const inGamePvp = new Set<string>();
  for (const match of activePvpMatches) {
    for (const player of (match as any).players ?? []) {
      inGamePvp.add(player.userId.toString());
    }
  }

  const now = Date.now();

  const result = users.map((u) => {
    const uid = u._id.toString();
    const isInGame = inGameSolo.has(uid) || inGamePvp.has(uid);
    const isOnline =
      u.lastSeenAt != null &&
      now - new Date(u.lastSeenAt).getTime() < ONLINE_THRESHOLD_MS;
    return {
      _id: uid,
      username: u.username,
      avatar: u.avatar,
      friendStatus: statusMap.get(uid) ?? 'none',
      level: levelMap.get(uid) ?? 1,
      totalSessions: sessionMap.get(uid) ?? 0,
      allTimeRank: rankMap.get(uid) ?? null,
      isOnline,
      isInGame,
      isReadyToPlay: !!u.publicProfile,
    };
  });

  return res.json({ users: result });
}

// ─── sendFriendRequest ────────────────────────────────────────────────────────

export async function sendFriendRequest(req: AuthRequest, res: Response) {
  const recipientId = req.body.targetUserId ?? req.body.userId;
  if (!recipientId) return res.status(400).json({ message: 'userId required' });
  if (recipientId === req.userId)
    return res.status(400).json({ message: 'Cannot friend yourself' });

  const existing = await Friend.findOne({
    $or: [
      { requesterId: req.userId, recipientId },
      { requesterId: recipientId, recipientId: req.userId },
    ],
  });

  if (existing) {
    if (existing.status === 'blocked') {
      return res.status(403).json({ message: 'Unable to send friend request' });
    }
    return res.status(400).json({ message: 'Friend request already exists' });
  }

  const friend = await Friend.create({ requesterId: req.userId, recipientId });

  // Non-blocking: fetch sender username then push notification
  User.findById(req.userId)
    .select('username')
    .lean()
    .then((sender) => {
      if (sender?.username) {
        sendFriendRequestNotification(recipientId, sender.username).catch(
          () => {},
        );
      }
    })
    .catch(() => {});

  return res.json({ ok: true, friend });
}

// ─── respondToRequest ─────────────────────────────────────────────────────────

export async function respondToRequest(req: AuthRequest, res: Response) {
  const { friendId } = req.params;
  const { accept } = req.body;

  const request = await Friend.findOne({
    _id: friendId,
    recipientId: req.userId,
    status: 'pending',
  });
  if (!request)
    return res.status(404).json({ message: 'Friend request not found' });

  request.status = accept ? 'accepted' : 'declined';
  await request.save();

  return res.json({ ok: true, status: request.status });
}

// ─── acceptRequest ────────────────────────────────────────────────────────────

export async function acceptRequest(req: AuthRequest, res: Response) {
  const { friendId } = req.body;
  if (!friendId) return res.status(400).json({ message: 'friendId required' });

  const request = await Friend.findOne({
    _id: friendId,
    recipientId: req.userId,
    status: 'pending',
  });
  if (!request)
    return res.status(404).json({ message: 'Friend request not found' });

  const requesterId = request.requesterId.toString();
  request.status = 'accepted';
  await request.save();

  // Non-blocking: fetch accepter username then push notification
  User.findById(req.userId)
    .select('username')
    .lean()
    .then((accepter) => {
      if (accepter?.username) {
        sendFriendAcceptedNotification(requesterId, accepter.username).catch(
          () => {},
        );
      }
    })
    .catch(() => {});

  return res.json({ ok: true, status: 'accepted' });
}

// ─── declineRequest ───────────────────────────────────────────────────────────

export async function declineRequest(req: AuthRequest, res: Response) {
  const { friendId } = req.body;
  if (!friendId) return res.status(400).json({ message: 'friendId required' });

  const request = await Friend.findOne({
    _id: friendId,
    recipientId: req.userId,
    status: 'pending',
  });
  if (!request)
    return res.status(404).json({ message: 'Friend request not found' });

  request.status = 'declined';
  await request.save();

  return res.json({ ok: true, status: 'declined' });
}

// ─── unfriendUser ─────────────────────────────────────────────────────────────

export async function unfriendUser(req: AuthRequest, res: Response) {
  const { userId: targetId } = req.body;
  if (!targetId) return res.status(400).json({ message: 'userId required' });

  const result = await Friend.deleteOne({
    $or: [
      { requesterId: req.userId, recipientId: targetId, status: 'accepted' },
      { requesterId: targetId, recipientId: req.userId, status: 'accepted' },
    ],
  });

  if (result.deletedCount === 0) {
    return res.status(404).json({ message: 'Friendship not found' });
  }

  return res.json({ ok: true });
}

// ─── blockUser ────────────────────────────────────────────────────────────────
//
// If a relationship already exists (pending / accepted / declined) it is
// updated to blocked. If none exists a new record is created so the target
// cannot send a request in the future. Blocker is normalised as requesterId.

export async function blockUser(req: AuthRequest, res: Response) {
  const { userId: targetId } = req.body;
  if (!targetId) return res.status(400).json({ message: 'userId required' });
  if (targetId === req.userId)
    return res.status(400).json({ message: 'Cannot block yourself' });

  const existing = await Friend.findOne({
    $or: [
      { requesterId: req.userId, recipientId: targetId },
      { requesterId: targetId, recipientId: req.userId },
    ],
  });

  if (existing) {
    existing.status = 'blocked';
    // Normalise direction so blocker is always requesterId
    (existing as any).requesterId = req.userId;
    (existing as any).recipientId = targetId;
    await existing.save();
  } else {
    await Friend.create({
      requesterId: req.userId,
      recipientId: targetId,
      status: 'blocked',
    });
  }

  return res.json({ ok: true });
}

// ─── getMyFriends ─────────────────────────────────────────────────────────────

export async function getMyFriends(req: AuthRequest, res: Response) {
  const friends = await Friend.find({
    $or: [
      { requesterId: req.userId, status: 'accepted' },
      { recipientId: req.userId, status: 'accepted' },
    ],
  }).lean();

  const ids = (friends as IFriend[]).map((f) =>
    f.requesterId.toString() === req.userId ? f.recipientId : f.requesterId,
  );

  const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

  const [users, activeSoloSessions, activePvpMatches] = await Promise.all([
    User.find({ _id: { $in: ids } })
      .select('username avatar publicProfile lastSeenAt')
      .lean(),
    ActiveQuizSession.find({ userId: { $in: ids }, finished: false })
      .select('userId')
      .lean(),
    PvPMatch.find({
      'players.userId': { $in: ids },
      state: { $in: ['MATCHED', 'ACTIVE', 'WAITING_ON_OPPONENT'] },
    })
      .select('players.userId')
      .lean(),
  ]);

  const inGameSolo = new Set(
    activeSoloSessions.map((s) => s.userId.toString()),
  );
  const inGamePvp = new Set<string>();
  for (const match of activePvpMatches) {
    for (const player of (match as any).players ?? []) {
      inGamePvp.add(player.userId.toString());
    }
  }

  const now = Date.now();

  const result = users.map((u) => {
    const uid = u._id.toString();
    const isInGame = inGameSolo.has(uid) || inGamePvp.has(uid);
    const isOnline =
      u.lastSeenAt != null &&
      now - new Date(u.lastSeenAt).getTime() < ONLINE_THRESHOLD_MS;
    return {
      _id: uid,
      username: u.username,
      avatar: u.avatar,
      isOnline,
      isInGame,
      isReadyToPlay: !!u.publicProfile,
    };
  });

  return res.json({ friends: result });
}

// ─── getPendingRequests ───────────────────────────────────────────────────────

export async function getPendingRequests(req: AuthRequest, res: Response) {
  const requests = (await Friend.find({
    recipientId: req.userId,
    status: 'pending',
  }).lean()) as IFriend[];

  const ids = requests.map((r) => r.requesterId);

  const users = await User.find({ _id: { $in: ids } })
    .select('username avatar')
    .lean();

  return res.json({
    requests: users.map((u, i) => ({
      ...u,
      friendId: requests[i]._id,
    })),
  });
}
