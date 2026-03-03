import { Router } from 'express';
import { requireAdmin } from '../middlewares/requireAdmin';
import { getFlaggedAccounts, resolveFlag } from '../controllers/adminAntiCheatController';

const router = Router();

router.get('/', requireAdmin, getFlaggedAccounts);
router.post('/:id/resolve', requireAdmin, resolveFlag);

export default router;
