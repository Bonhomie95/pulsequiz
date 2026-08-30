import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { quizStartLimiter } from '../middlewares/rateLimit';
import {
  start,
  answer,
  finish,
  state,
  hint,
  extendTime,
} from '../controllers/quizController';

const router = Router();

// 25 sessions/hour per user
router.post('/start', requireAuth, quizStartLimiter, start);

// per-question submit (anti-cheat)
router.post('/answer', requireAuth, answer);

// finalize + apply points/coins
router.get('/state/:sessionId', requireAuth, state);
router.post('/finish', requireAuth, finish);
router.post('/hint', requireAuth, hint);
router.post('/extend-time', requireAuth, extendTime);

export default router;
