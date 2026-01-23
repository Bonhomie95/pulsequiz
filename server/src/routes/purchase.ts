import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import {
  verifyApple,
  verifyGoogle,
  restoreApple
} from '../controllers/purchaseController';

const router = Router();

router.post('/apple/verify', requireAuth, verifyApple);
router.post('/google/verify', requireAuth, verifyGoogle);
router.post('/apple/restore', requireAuth, restoreApple);


export default router;
