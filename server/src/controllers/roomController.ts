import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/auth';
import Room from '../models/Room';
import { getSetting, SETTINGS_KEYS } from '../models/AppSettings';
import { getBalance } from '../services/coinService';
import crypto from 'crypto';

function generateRoomCode(): string {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

export async function createRoom(req: AuthRequest, res: Response) {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized' });

  const { category, wager } = z.object({
    category: z.string(),
    wager: z.number().min(0).default(0),
  }).parse(req.body);

  const maxWager = Number(await getSetting(SETTINGS_KEYS.MAX_PVP_WAGER, 500));
  if (wager > maxWager) return res.status(400).json({ message: `Max wager is ${maxWager} coins` });

  if (wager > 0) {
    const balance = await getBalance(req.userId);
    if (balance < wager) return res.status(400).json({ message: 'Insufficient coins' });
  }

  // Invalidate existing open rooms by this host
  await Room.updateMany({ hostId: req.userId, status: 'waiting' }, { status: 'cancelled' });

  let code = generateRoomCode();
  let attempts = 0;
  while (await Room.findOne({ code }) && attempts < 10) {
    code = generateRoomCode();
    attempts++;
  }

  const room = await Room.create({
    code,
    hostId: req.userId,
    category: category.trim().toLowerCase(),
    wager,
    status: 'waiting',
  });

  return res.json({ room: { code: room.code, category, wager, roomId: room._id } });
}

export async function joinRoom(req: AuthRequest, res: Response) {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized' });

  const { code } = z.object({ code: z.string().length(6) }).parse(req.body);

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
