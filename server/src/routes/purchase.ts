import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import {
  verifyApple,
  verifyGoogle,
} from '../controllers/purchaseController';

const router = Router();

router.post('/apple/verify', requireAuth, verifyApple);
router.post('/google/verify', requireAuth, verifyGoogle);

export default router;
