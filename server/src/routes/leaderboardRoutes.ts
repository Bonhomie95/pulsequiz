import { Router } from 'express';
import { getLeaderboard } from '../controllers/leaderboardController';

const router = Router();

/**
 * GET /leaderboard/weekly
 * GET /leaderboard/monthly
 * GET /leaderboard/all
 */
router.get('/:type', getLeaderboard);

export default router;
