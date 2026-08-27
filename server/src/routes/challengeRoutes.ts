import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { sensitiveActionLimiter } from '../middlewares/rateLimit';
import { getMyChallenges, claimChallenge } from '../controllers/challengeController';

const router = Router();

router.get('/', requireAuth, getMyChallenges);
router.post(
  '/:challengeId/claim',
  requireAuth,
  sensitiveActionLimiter,
  claimChallenge,
);

export default router;
