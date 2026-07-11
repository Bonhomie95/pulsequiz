import { Router } from 'express';
import { adminLogin, adminLogout } from '../controllers/adminAuthController';
import { adminLoginLimiter } from '../middlewares/rateLimit';

const router = Router();

router.post('/login', adminLoginLimiter, adminLogin);
router.post('/logout', adminLogout);

export default router;
