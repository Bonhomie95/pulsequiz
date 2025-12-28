import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import {
  submitQuiz,
  dailyCheckIn,
  getProgress,
} from '../controllers/progressController';

const router = Router();

router.post('/quiz', requireAuth, submitQuiz);
router.post('/check-in', requireAuth, dailyCheckIn);
router.get('/me', requireAuth, getProgress);

export default router;
