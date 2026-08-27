import { Router } from 'express';
import { adminLogin, adminLogout, adminMe } from '../controllers/adminAuthController';
import { adminLoginLimiter } from '../middlewares/rateLimit';
import { requireAdmin } from '../middlewares/requireAdmin';

const router = Router();

router.post('/login', adminLoginLimiter, adminLogin);
router.post('/logout', adminLogout);
router.get('/me', requireAdmin, adminMe);

export default router;
