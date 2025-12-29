import { Router } from 'express';
import { oauthLogin, setIdentity, me } from '../controllers/authController';
import { requireAuth } from '../middlewares/auth';
import { oauthLimiter } from '../services/oauth/oauthLimiter';

const router = Router();

router.post('/oauth', oauthLimiter, oauthLogin);
router.post('/identity', requireAuth, setIdentity);
router.get('/me', requireAuth, me);

export default router;
