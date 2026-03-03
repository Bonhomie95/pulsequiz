import { Router, Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { requireAdmin } from '../middlewares/requireAdmin';

// Dynamic import to avoid error if model doesn't exist yet
let Tournament: any;
try {
  Tournament = require('../models/Tournament').default;
} catch {
  Tournament = null;
}

const router = Router();

const checkModel = (res: Response) => {
  if (!Tournament) {
    res.status(501).json({ message: 'Tournament model not configured. See adminTournamentRoutes.ts for setup.' });
    return false;
  }
  return true;
};

// GET /admin/tournaments
router.get('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  if (!checkModel(res)) return;
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Number(req.query.limit) || 20;
    const status = req.query.status as string | undefined;
    const filter: Record<string, any> = {};
    if (status) filter.status = status;

    const [tournaments, total] = await Promise.all([
      Tournament.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Tournament.countDocuments(filter),
    ]);

    return res.json({ tournaments, total });
  } catch (e) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// POST /admin/tournaments
router.post('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  if (!checkModel(res)) return;
  try {
    const t = await Tournament.create(req.body);
    return res.status(201).json(t);
  } catch (e: any) {
    return res.status(400).json({ message: e.message });
  }
});

// PATCH /admin/tournaments/:id
router.patch('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  if (!checkModel(res)) return;
  try {
    const t = await Tournament.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!t) return res.status(404).json({ message: 'Not found' });
    return res.json(t);
  } catch (e: any) {
    return res.status(400).json({ message: e.message });
  }
});

// DELETE /admin/tournaments/:id
router.delete('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  if (!checkModel(res)) return;
  try {
    await Tournament.findByIdAndDelete(req.params.id);
    return res.json({ message: 'Deleted' });
  } catch (e) {
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;
