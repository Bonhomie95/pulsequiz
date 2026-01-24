import { Router } from 'express';
import { requireAdmin } from '../middlewares/requireAdmin';
import { getRecentActivity } from '../controllers/adminActivityController';

const router = Router();
router.get('/', requireAdmin, getRecentActivity);
export default router;
