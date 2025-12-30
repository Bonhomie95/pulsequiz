import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { checkIn } from '../controllers/streakController';

const router = Router();

router.post('/check-in', requireAuth, checkIn);

export default router;
