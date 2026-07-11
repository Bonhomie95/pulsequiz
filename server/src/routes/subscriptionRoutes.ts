import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { purchaseLimiter } from '../middlewares/rateLimit';
import {
  getSubscriptionStatus,
  verifyAppleSub,
  verifyGoogleSub,
  restoreAppleSub,
} from '../controllers/subscriptionController';

const router = Router();

router.get('/status',          requireAuth, getSubscriptionStatus);
router.post('/apple/verify',   requireAuth, purchaseLimiter, verifyAppleSub);
router.post('/google/verify',  requireAuth, purchaseLimiter, verifyGoogleSub);
router.post('/apple/restore',  requireAuth, purchaseLimiter, restoreAppleSub);

export default router;
