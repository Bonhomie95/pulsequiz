import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { getMyReferrals, getReferralCode, applyReferralCode } from '../controllers/referralController';

const router = Router();

router.get('/', requireAuth, getMyReferrals);
router.get('/code', requireAuth, getReferralCode);
router.post('/apply', requireAuth, applyReferralCode);

export default router;
