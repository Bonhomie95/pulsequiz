import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { sensitiveActionLimiter } from '../middlewares/rateLimit';
import { rewardAd } from '../controllers/adsController';

const router = Router();

router.post('/reward', requireAuth, sensitiveActionLimiter, rewardAd);

export default router;
