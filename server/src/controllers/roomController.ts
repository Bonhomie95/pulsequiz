import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/auth';
import Room from '../models/Room';
import { getSetting, SETTINGS_KEYS } from '../models/AppSettings';
import { getBalance } from '../services/coinService';
import crypto from 'crypto';

/**
 * 4 characters from an unambiguous alphabet (no O/0, I/1). Room codes get read
 * aloud and typed by hand, and eight characters was too many for that — the
 * length is a usability decision, taken knowingly.
 *
 * That leaves 32^4 = 1,048,576 codes. Guessing one *specific* room is still
 * hopeless at 20 join attempts per 10 minutes, but with many rooms open at once
 * a persistent attacker could eventually land in a stranger's room and play
 * their wager. Only `status: 'waiting'` rooms are joinable and they are
 * short-lived, which is what keeps the exposed window small. If gate-crashing
 * ever shows up, the levers are RATE_LIMIT_ROOM_JOIN_MAX and a shorter room
 * lifetime, not a longer code.
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 4;

function generateRoomCode(): string {
  const bytes = crypto.randomBytes(ROOM_CODE_LENGTH);
  let out = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

export async function createRoom(req: AuthRequest, res: Response) {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized' });

  const parsed = z
    .object({
      category: z.string().min(2).max(64),
      wager: z.number().int().min(0).default(0),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: 'Pick a category and a valid wager' });
  }
  const { category, wager } = parsed.data;

  const maxWager = Number(await getSetting(SETTINGS_KEYS.MAX_PVP_WAGER, 500));
  if (wager > maxWager) return res.status(400).json({ message: `Max wager is ${maxWager} coins` });

  if (wager > 0) {
    const balance = await getBalance(req.userId);
    if (balance < wager) return res.status(400).json({ message: 'Insufficient coins' });
  }

  // Invalidate existing open rooms by this host
  await Room.updateMany({ hostId: req.userId, status: 'waiting' }, { status: 'cancelled' });

  // Let the unique index arbitrate collisions rather than a check-then-insert
  // race — and fail loudly instead of inserting a duplicate after 10 tries.
  let room = null;
  for (let attempt = 0; attempt < 16 && !room; attempt++) {
    try {
      room = await Room.create({
        code: generateRoomCode(),
        hostId: req.userId,
        category: category.trim().toLowerCase(),
        wager,
        status: 'waiting',
      });
    } catch (err: any) {
      if (err?.code !== 11000) throw err;
    }
  }

  if (!room) {
    return res.status(503).json({ message: 'Could not create a room. Please try again.' });
  }

  return res.json({ room: { code: room.code, category, wager, roomId: room._id } });
}

export async function joinRoom(req: AuthRequest, res: Response) {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized' });

  const parsedJoin = z
    .object({ code: z.string().trim().min(ROOM_CODE_LENGTH).max(10).regex(/^[A-Za-z0-9]+$/) })
    .safeParse(req.body);

  if (!parsedJoin.success) {
    return res.status(400).json({ message: 'That room code looks wrong' });
  }
  const { code } = parsedJoin.data;

  const room = await Room.findOne({ code: code.toUpperCase(), status: 'waiting' });
  if (!room) return res.status(404).json({ message: 'Room not found or already started' });
  if (room.hostId.toString() === req.userId) return res.status(400).json({ message: 'Cannot join your own room' });

  if (room.wager > 0) {
    const balance = await getBalance(req.userId);
    if (balance < room.wager) return res.status(400).json({ message: 'Insufficient coins to match wager' });
  }

  // Don't save guestId here — socket handler does it when both are connected
  return res.json({
    room: {
      code: room.code,
      category: room.category,
      wager: room.wager,
      hostId: room.hostId,
      roomId: room._id,
    },
  });
}

export async function getRoomByCode(req: AuthRequest, res: Response) {
  const { code } = req.params;
  const room = await Room.findOne({ code: code.toUpperCase() }).lean();
  if (!room) return res.status(404).json({ message: 'Room not found' });
  return res.json({ room });
}
