import { Router, Response } from 'express';
import { z } from 'zod';

import { requireAuth, AuthRequest } from '../middlewares/auth';
import { sensitiveActionLimiter } from '../middlewares/rateLimit';
import { getDailyView, isPlayableDate } from '../services/dailyService';
import { getLeagueView } from '../services/leagueService';
import {
  createDuel,
  DUEL_CODE_RE,
  DuelError,
  getDuel,
  listMyDuels,
} from '../services/duelService';

/** Daily quiz, weekly leagues and async friend duels. Mounted at /api. */
const router = Router();

// GET /api/daily?date=YYYY-MM-DD (the player's local date)
router.get('/daily', requireAuth, async (req: AuthRequest, res: Response) => {
  const date = String(req.query.date ?? '');
  if (!isPlayableDate(date)) return res.status(400).json({ message: 'Invalid date' });
  return res.json(await getDailyView(req.userId!, date));
});

// GET /api/leagues/current
router.get('/leagues/current', requireAuth, async (req: AuthRequest, res: Response) => {
  return res.json(await getLeagueView(req.userId!));
});

const CreateDuelSchema = z.object({ category: z.string().trim().toLowerCase().min(2).max(40) });

// POST /api/duels { category } → { code }
router.post('/duels', requireAuth, sensitiveActionLimiter, async (req: AuthRequest, res: Response) => {
  const parsed = CreateDuelSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Pick a category' });
  try {
    return res.status(201).json(await createDuel(req.userId!, parsed.data.category));
  } catch (err) {
    if (err instanceof DuelError) return res.status(err.status).json({ message: err.message });
    throw err;
  }
});

// GET /api/duels — my recent challenges
router.get('/duels', requireAuth, async (req: AuthRequest, res: Response) => {
  return res.json({ duels: await listMyDuels(req.userId!) });
});

// GET /api/duels/:code
router.get('/duels/:code', requireAuth, async (req: AuthRequest, res: Response) => {
  const code = String(req.params.code ?? '').toUpperCase();
  if (!DUEL_CODE_RE.test(code)) return res.status(400).json({ message: 'Invalid code' });
  try {
    return res.json(await getDuel(code, req.userId!));
  } catch (err) {
    if (err instanceof DuelError) return res.status(err.status).json({ message: err.message });
    throw err;
  }
});

export default router;
