import { Router } from 'express';
import { requireAdmin, requireSuperAdmin } from '../middlewares/requireAdmin';
import {
  getAllPayouts,
  retryPayout,
  setPrizePool,
  getPrizePools,
  getPeriodOptions,
  triggerPayout,
  exportPayoutsCSV,
} from '../controllers/adminPayoutController';

const router = Router();

router.use(requireAdmin);

router.get('/',                getAllPayouts);
router.get('/prize-pools',     getPrizePools);
router.get('/period-options',  getPeriodOptions);
router.get('/export',          requireSuperAdmin, exportPayoutsCSV);

// Everything below moves real money.
router.post('/:id/retry',      requireSuperAdmin, retryPayout);
router.post('/prize-pools',    requireSuperAdmin, setPrizePool);
router.post('/trigger',        requireSuperAdmin, triggerPayout);

export default router;
