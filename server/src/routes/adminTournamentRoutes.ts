import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAdmin, requireSuperAdmin } from '../middlewares/requireAdmin';
import { auditAdmin } from '../utils/adminAudit';
import { cancelTournament } from '../services/tournamentService';

import Tournament from '../models/Tournament';

const router = Router();
router.use(requireAdmin);

// Whitelist — participants, settledAt etc. must never be settable from a body.
// No .default()s here: zod applies defaults even under .partial(), so a PATCH
// of { status } would have wiped the description and winnersCount.
const TournamentFields = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().max(1000),
  category: z.string().trim().toLowerCase().min(2).max(60),
  status: z.enum(['upcoming', 'active', 'finished', 'cancelled']).optional(),
  entryFeeCoins: z.number().int().min(0).max(1_000_000),
  prizePoolCoins: z.number().int().min(0).max(100_000_000),
  maxParticipants: z.number().int().min(2).max(100_000),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  winnersCount: z.number().int().min(1).max(100),
  prizeDistribution: z
    .array(z.object({ rank: z.number().int().min(1), coins: z.number().int().min(0) }))
    .max(100),
});
const CreateBody = TournamentFields.partial({
  description: true,
  status: true,
  winnersCount: true,
  prizeDistribution: true,
});
const PatchBody = TournamentFields.partial();

function checkDates(b: { startsAt?: Date; endsAt?: Date }) {
  return !(b.startsAt && b.endsAt && b.endsAt <= b.startsAt);
}

// GET /admin/tournaments
router.get('/', async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;

  const [tournaments, total] = await Promise.all([
    Tournament.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Tournament.countDocuments(filter),
  ]);

  return res.json({ tournaments, total });
});

// POST /admin/tournaments
router.post('/', requireSuperAdmin, async (req: Request, res: Response) => {
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid tournament' });
  }
  if (!checkDates(parsed.data)) return res.status(400).json({ message: 'End must be after start' });

  const t = await Tournament.create(parsed.data);
  await auditAdmin(req, 'tournament.create', {
    targetType: 'tournament',
    targetId: t._id.toString(),
    after: parsed.data,
  });
  return res.status(201).json(t);
});

// PATCH /admin/tournaments/:id
router.patch('/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  const parsed = PatchBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid tournament' });
  }
  const t = await Tournament.findById(req.params.id);
  if (!t) return res.status(404).json({ message: 'Not found' });
  if (t.settledAt) return res.status(409).json({ message: 'This tournament is already settled' });

  const update = parsed.data;
  // Changing the fee after people paid would make refunds wrong.
  if (update.entryFeeCoins !== undefined && update.entryFeeCoins !== t.entryFeeCoins && t.participants.length) {
    return res.status(409).json({ message: 'Entry fee cannot change once players have joined' });
  }
  // Cancel goes through the refunding path, never a bare status flip.
  if (update.status === 'cancelled' || update.status === 'finished') {
    return res.status(400).json({ message: 'Use Cancel (refunds) or let the tournament finish' });
  }
  const before = t.toObject();
  t.set(update);
  if (!checkDates(t)) return res.status(400).json({ message: 'End must be after start' });
  await t.save();

  await auditAdmin(req, 'tournament.update', {
    targetType: 'tournament',
    targetId: req.params.id,
    before: { title: before.title, entryFeeCoins: before.entryFeeCoins, prizePoolCoins: before.prizePoolCoins },
    after: update,
  });
  return res.json(t);
});

// POST /admin/tournaments/:id/cancel — cancel and refund every entry fee
router.post('/:id/cancel', requireSuperAdmin, async (req: Request, res: Response) => {
  const result = await cancelTournament(String(req.params.id));
  if (!result.cancelled) {
    return res.status(409).json({ message: 'Only an upcoming or active, unsettled tournament can be cancelled' });
  }
  await auditAdmin(req, 'tournament.cancel', {
    targetType: 'tournament',
    targetId: String(req.params.id),
    after: result,
  });
  return res.json(result);
});

// DELETE /admin/tournaments/:id — only when nobody has paid in
router.delete('/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  const t = await Tournament.findById(req.params.id).lean();
  if (!t) return res.status(404).json({ message: 'Not found' });
  if (t.participants.length && !t.settledAt && (t.entryFeeCoins ?? 0) > 0) {
    return res.status(409).json({ message: 'Players have paid to enter — cancel it instead so they are refunded' });
  }
  await Tournament.deleteOne({ _id: t._id });
  await auditAdmin(req, 'tournament.delete', {
    targetType: 'tournament',
    targetId: String(req.params.id),
    before: { title: t.title, participants: t.participants.length },
  });
  return res.json({ message: 'Deleted' });
});

export default router;
