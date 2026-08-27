import { Router } from 'express';
import { requireAdmin, requireSuperAdmin } from '../middlewares/requireAdmin';
import {
  getAllSettings,
  updateSetting,
  bulkUpdateSettings,
} from '../controllers/adminSettingsController';

const router = Router();

router.use(requireAdmin);

router.get('/', getAllSettings);

// These keys are the economy's dials — coin rewards, wager caps, payout
// thresholds. SUPER_ADMIN only.
router.patch('/',    requireSuperAdmin, updateSetting);
router.put('/bulk',  requireSuperAdmin, bulkUpdateSettings);

export default router;
