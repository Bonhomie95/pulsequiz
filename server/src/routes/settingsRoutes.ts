import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { walletUpdateLimiter } from '../middlewares/rateLimit';
import { updateSettings, getPayoutEligibility } from '../controllers/settingsController';

const router = Router();

// The wallet limiter only bites on payout-address changes, which is the field
// worth protecting; theme and profile toggles pass through the global limiter.
router.patch('/', requireAuth, walletUpdateLimiter, updateSettings);
router.get('/payout-eligibility', requireAuth, getPayoutEligibility);

export default router;
