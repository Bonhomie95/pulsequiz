import { Router } from 'express';
import { requireAdmin } from '../middlewares/requireAdmin';
import { getAllSettings, updateSetting, bulkUpdateSettings } from '../controllers/adminSettingsController';

const router = Router();

router.get('/', requireAdmin, getAllSettings);
router.patch('/', requireAdmin, updateSetting);
router.put('/bulk', requireAdmin, bulkUpdateSettings);

export default router;
