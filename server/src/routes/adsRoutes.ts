import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { sensitiveActionLimiter } from '../middlewares/rateLimit';
import { getAdConfig, rewardAd } from '../controllers/adsController';

const router = Router();

router.get('/config', requireAuth, getAdConfig);
router.post('/reward', requireAuth, sensitiveActionLimiter, rewardAd);

export default router;
