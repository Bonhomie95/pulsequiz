import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { getMyPayouts, getCurrentPrizePools, getRevealedPrizePools } from '../controllers/payoutController';

const router = Router();

router.get('/mine', requireAuth, getMyPayouts);
router.get('/prize-pools/current', requireAuth, getCurrentPrizePools);
router.get('/prize-pools/revealed', requireAuth, getRevealedPrizePools);

export default router;
