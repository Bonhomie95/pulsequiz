import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/auth';
import Room from '../models/Room';
import { getSetting, SETTINGS_KEYS } from '../models/AppSettings';
import { getBalance } from '../services/coinService';
import crypto from 'crypto';

/**
 * 8 characters from an unambiguous alphabet (no O/0, I/1) — ~1.8e12 codes,
 * which with the join rate limit makes enumeration impractical. The previous
 * 6-hex-character code was only 16.7M wide.
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

function generateRoomCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
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
  for (let attempt = 0; attempt < 8 && !room; attempt++) {
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
    .object({ code: z.string().trim().min(4).max(10).regex(/^[A-Za-z0-9]+$/) })
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
