import { Router } from 'express';
import { oauthLogin, setIdentity, me } from '../controllers/authController';
import { requireAuth } from '../middlewares/auth';

const router = Router();

router.post('/oauth', oauthLogin);
router.post('/identity', requireAuth, setIdentity);
router.get('/me', requireAuth, me);

export default router;
