/**
 * room.handlers.ts
 * Handles Play-With-Friends room socket events.
 *
 * Flow:
 *   HOST: creates room via REST  (/api/rooms/create)  → gets roomCode
 *   HOST: connects socket, emits room:join { code }  → server listens for guest
 *   GUEST: enters code, hits REST  (/api/rooms/join)  → gets back room info
 *   GUEST: connects socket, emits room:join { code }  → server sees both → creates PvPMatch
 *   BOTH: receive room:guest_joined { matchId, players }  → navigate to VS screen
 */

import type { Server, Socket } from 'socket.io';
import { Types } from 'mongoose';
import { SOCKET_EVENTS } from './events';
import { safeHandler } from './safeHandler';
import Room from '../models/Room';
import PvPMatch from '../models/PvPMatch';
import User from '../models/User';
import Progress from '../models/Progress';
import { lockWager } from '../services/coinService';

// roomCode → Set of socketIds in the room
const roomSockets = new Map<string, { hostSocketId: string; guestSocketId?: string }>();
// userId → roomCode they are hosting/in
const userRoom = new Map<string, string>();

/**
 * Room codes are short and therefore guessable. Cap how many a single socket
 * may try before we stop answering, so an attacker can't walk the space and
 * drop into a stranger's wagered private match.
 */
const MAX_JOIN_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 10 * 60_000;
const joinAttempts = new Map<string, { count: number; resetAt: number }>();

function tooManyAttempts(userId: string): boolean {
  const now = Date.now();
  const record = joinAttempts.get(userId);

  if (!record || now > record.resetAt) {
    joinAttempts.set(userId, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return false;
  }
  record.count += 1;
  return record.count > MAX_JOIN_ATTEMPTS;
}

/** Drop every handle a finished/abandoned room was holding. */
function releaseRoom(roomCode: string, userIds: string[]) {
  roomSockets.delete(roomCode);
  for (const uid of userIds) {
    if (userRoom.get(uid) === roomCode) userRoom.delete(uid);
  }
}

async function snapshotPlayer(userId: string) {
  const [user, progress] = await Promise.all([
    User.findById(userId).lean(),
    Progress.findOne({ userId }).lean(),
  ]);
  return {
    userId: new Types.ObjectId(userId),
    usernameSnapshot: user?.username ?? 'Player',
    avatarSnapshot: user?.avatar ?? 'avatar0',
    levelSnapshot: progress?.level ?? 1,
    allTimeRankSnapshot: 0,
  };
}

export function registerRoomHandlers(io: Server, socket: Socket) {
  const userId = socket.data.userId as string;

  socket.on(SOCKET_EVENTS.ROOM_JOIN, safeHandler(socket, SOCKET_EVENTS.ROOM_JOIN, async ({ code }: { code?: string }) => {
    const roomCode = String(code ?? '').toUpperCase().trim();
    if (!/^[A-Z0-9]{4,10}$/.test(roomCode)) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'That room code looks wrong' });
      return;
    }

    const room = await Room.findOne({ code: roomCode, status: 'waiting' });

    // Rate-limit misses only, so a legitimate host reconnecting repeatedly
    // isn't punished for it.
    if (!room) {
      if (tooManyAttempts(userId)) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          message: 'Too many room code attempts. Try again in a few minutes.',
        });
        return;
      }
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Room not found or already started' });
      return;
    }

    const isHost = room.hostId.toString() === userId;

    if (isHost) {
      // Host registering their socket — store and wait for guest
      socket.join(`room:${roomCode}`);
      roomSockets.set(roomCode, { hostSocketId: socket.id });
      userRoom.set(userId, roomCode);
      return; // just wait
    }

    // Guest joining
    if (room.hostId.toString() === userId) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Cannot join your own room' });
      return;
    }

    const existing = roomSockets.get(roomCode);
    if (!existing) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Host not connected yet. Try again shortly.' });
      return;
    }

    socket.join(`room:${roomCode}`);
    existing.guestSocketId = socket.id;
    userRoom.set(userId, roomCode);

    // Mark room as active
    room.guestId = new Types.ObjectId(userId) as any;
    room.status = 'active';
    await room.save();

    // Build player snapshots
    const [snapHost, snapGuest] = await Promise.all([
      snapshotPlayer(room.hostId.toString()),
      snapshotPlayer(userId),
    ]);

    // Create PvPMatch document
    const match = await PvPMatch.create({
      category: room.category,
      mode: 'single',
      state: 'MATCHED',
      wager: room.wager,
      players: [
        { ...snapHost, ready: false, connected: false },
        { ...snapGuest, ready: false, connected: false },
      ],
      questionSet: [],
      matchmakingExpiresAt: new Date(Date.now() + 120_000),
    });

    const matchId = match._id.toString();

    // Lock wager if set
    if (room.wager > 0) {
      const lockResult = await lockWager(
        room.hostId.toString(),
        userId,
        room.wager,
        matchId,
      );
      if (!lockResult.success) {
        await PvPMatch.deleteOne({ _id: match._id });
        // Put the room back to 'waiting' rather than cancelling it — the host
        // did nothing wrong, and a different guest may still be able to cover.
        room.status = 'waiting';
        room.guestId = null as any;
        await room.save();

        const whoIsShort =
          lockResult.error === 'player_a_insufficient' ? 'The host' : 'You';
        socket.emit(SOCKET_EVENTS.ERROR, {
          message: `${whoIsShort} ${whoIsShort === 'You' ? "don't" : "doesn't"} have the ${room.wager} coins for this wager.`,
        });
        io.to(existing.hostSocketId).emit(SOCKET_EVENTS.ERROR, {
          message: 'A player tried to join but the wager could not be staked.',
        });
        return;
      }
    }

    // Store matchId on room
    room.matchId = match._id as any;
    await room.save();

    const playerA = {
      userId: room.hostId.toString(),
      username: snapHost.usernameSnapshot,
      avatar: snapHost.avatarSnapshot,
      level: snapHost.levelSnapshot,
      allTimeRank: 0,
    };
    const playerB = {
      userId,
      username: snapGuest.usernameSnapshot,
      avatar: snapGuest.avatarSnapshot,
      level: snapGuest.levelSnapshot,
      allTimeRank: 0,
    };

    // Notify both players
    io.to(`room:${roomCode}`).emit(SOCKET_EVENTS.ROOM_GUEST_JOINED, {
      matchId,
      category: room.category,
      wager: room.wager,
      players: [playerA, playerB],
    });

    // Cleanup room tracking
    releaseRoom(roomCode, [room.hostId.toString(), userId]);
  }));

  socket.on('disconnect', () => {
    joinAttempts.delete(userId);

    const code = userRoom.get(userId);
    if (!code) return;
    userRoom.delete(userId);

    const entry = roomSockets.get(code);
    if (!entry) return;

    if (entry.hostSocketId === socket.id) {
      // Host left while waiting — the room can't proceed.
      Room.updateOne({ code, status: 'waiting' }, { status: 'cancelled' }).catch(() => {});
      io.to(`room:${code}`).emit(SOCKET_EVENTS.ROOM_CANCELLED, { reason: 'host_disconnected' });
      roomSockets.delete(code);
    } else if (entry.guestSocketId === socket.id) {
      // Guest left before the match started — free the slot for someone else.
      entry.guestSocketId = undefined;
    }
  });
}
