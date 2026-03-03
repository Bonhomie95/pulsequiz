import { Router } from 'express';
import { getLeaderboard, getMyRank } from '../controllers/leaderboardController';
import { requireAuth } from '../middlewares/auth';

const router = Router();

router.get('/my-rank', requireAuth, getMyRank);
router.get('/:type', getLeaderboard);

export default router;
