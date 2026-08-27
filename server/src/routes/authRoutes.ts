import { Router } from 'express';
import {
  oauthLogin,
  setIdentity,
  me,
  checkUsername,
  refresh,
  logout,
  deleteAccount,
  exportMyData,
} from '../controllers/authController';
import { requireAuth } from '../middlewares/auth';
import { oauthLimiter, sensitiveActionLimiter } from '../middlewares/rateLimit';

const router = Router();

router.post('/oauth', oauthLimiter, oauthLogin);
router.post('/refresh', oauthLimiter, refresh);

router.post('/identity', requireAuth, setIdentity);
router.get('/username-check', requireAuth, checkUsername);
router.get('/me', requireAuth, me);

router.post('/logout', requireAuth, logout);

// Account deletion and data export are both store/GDPR requirements.
router.delete('/account', requireAuth, sensitiveActionLimiter, deleteAccount);
router.get('/export', requireAuth, sensitiveActionLimiter, exportMyData);

export default router;
