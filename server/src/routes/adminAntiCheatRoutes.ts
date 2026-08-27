import { Router } from 'express';
import { requireAdmin, requireSuperAdmin } from '../middlewares/requireAdmin';
import { getFlaggedAccounts, resolveFlag } from '../controllers/adminAntiCheatController';

const router = Router();

router.get('/', requireAdmin, getFlaggedAccounts);
// Resolving a flag re-enables payouts for that account, so it is a
// money-adjacent action rather than plain moderation.
router.post('/:id/resolve', requireAdmin, requireSuperAdmin, resolveFlag);

export default router;
