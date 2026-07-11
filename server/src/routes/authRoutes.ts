import { Router } from 'express';
import {
  oauthLogin,
  setIdentity,
  me,
  checkUsername,
} from '../controllers/authController';
import { requireAuth } from '../middlewares/auth';
import { oauthLimiter } from '../middlewares/rateLimit';

const router = Router();

router.post('/oauth', oauthLimiter, oauthLogin);
router.post('/identity', requireAuth, setIdentity);
router.get('/username-check', requireAuth, checkUsername);
router.get('/me', requireAuth, me);

export default router;
