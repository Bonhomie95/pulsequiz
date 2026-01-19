import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { rewardAd } from '../controllers/adsController';
export const router = Router();

router.post('/reward', requireAuth, rewardAd);

export default router;
