import { Router } from 'express';
import { requireAdmin } from '../middlewares/requireAdmin';
import {
  getTotalUsers,
  getTotalCoins,
  getPurchasesToday,
  getFlaggedUsers,
  getStreakStats,
} from '../controllers/adminStatsController';

const router = Router();

router.get('/users', requireAdmin, getTotalUsers);
router.get('/coins', requireAdmin, getTotalCoins);
router.get('/purchases-today', requireAdmin, getPurchasesToday);
router.get('/flags', requireAdmin, getFlaggedUsers);
router.get('/streaks', requireAdmin, getStreakStats);

export default router;
