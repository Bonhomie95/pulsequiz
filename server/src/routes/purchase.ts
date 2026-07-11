import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { purchaseLimiter } from '../middlewares/rateLimit';
import {
  verifyApple,
  verifyGoogle,
  restoreApple,
} from '../controllers/purchaseController';

const router = Router();

router.post('/apple/verify', requireAuth, purchaseLimiter, verifyApple);
router.post('/google/verify', requireAuth, purchaseLimiter, verifyGoogle);
router.post('/apple/restore', requireAuth, purchaseLimiter, restoreApple);

export default router;
