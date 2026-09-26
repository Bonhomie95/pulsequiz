import { Router } from 'express';
import {
  getFriendsLeaderboard,
  getLeaderboard,
  getMyRank,
} from '../controllers/leaderboardController';
import { requireAuth } from '../middlewares/auth';

const router = Router();

router.get('/my-rank', requireAuth, getMyRank);
// Before '/:type', or 'friends' would be taken for a period type.
router.get('/friends', requireAuth, getFriendsLeaderboard);
// Authenticated so the response can include the caller's own standing; the
// board itself is public data either way.
router.get('/:type', requireAuth, getLeaderboard);

export default router;
