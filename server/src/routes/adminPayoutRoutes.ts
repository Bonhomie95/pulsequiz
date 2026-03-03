import { Router } from 'express';
import { requireAdmin } from '../middlewares/requireAdmin';
import {
  getAllPayouts,
  retryPayout,
  setPrizePool,
  getPrizePools,
  triggerPayout,
  exportPayoutsCSV,
} from '../controllers/adminPayoutController';

const router = Router();

router.get('/', requireAdmin, getAllPayouts);
router.get('/csv', requireAdmin, exportPayoutsCSV);
router.get('/prize-pools', requireAdmin, getPrizePools);
router.post('/prize-pools', requireAdmin, setPrizePool);
router.post('/:id/retry', requireAdmin, retryPayout);
router.post('/trigger', requireAdmin, triggerPayout);

export default router;
