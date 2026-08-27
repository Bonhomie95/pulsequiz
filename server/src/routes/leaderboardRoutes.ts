import { Router } from 'express';
import { getLeaderboard, getMyRank } from '../controllers/leaderboardController';
import { requireAuth } from '../middlewares/auth';

const router = Router();

router.get('/my-rank', requireAuth, getMyRank);
// Authenticated so the response can include the caller's own standing; the
// board itself is public data either way.
router.get('/:type', requireAuth, getLeaderboard);

export default router;
