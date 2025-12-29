import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { quizStartLimiter } from '../middlewares/rateLimit';
import { start, answer, finish } from '../controllers/quizController';

const router = Router();

// 25 sessions/hour per user
router.post('/start', requireAuth, quizStartLimiter, start);

// per-question submit (anti-cheat)
router.post('/answer', requireAuth, answer);

// finalize + apply points/coins
router.post('/finish', requireAuth, finish);

export default router;
