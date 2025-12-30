import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { getWallet } from '../controllers/coinController';

const router = Router();

router.get('/wallet', requireAuth, getWallet);

export default router;
