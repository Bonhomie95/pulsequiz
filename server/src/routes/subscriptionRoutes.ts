import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import {
  getSubscriptionStatus,
  verifyAppleSub,
  verifyGoogleSub,
  restoreAppleSub,
} from '../controllers/subscriptionController';

const router = Router();

router.get('/status',          requireAuth, getSubscriptionStatus);
router.post('/apple/verify',   requireAuth, verifyAppleSub);
router.post('/google/verify',  requireAuth, verifyGoogleSub);
router.post('/apple/restore',  requireAuth, restoreAppleSub);

export default router;
