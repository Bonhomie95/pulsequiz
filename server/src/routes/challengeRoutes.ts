import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { getMyChallenges, claimChallenge } from '../controllers/challengeController';

const router = Router();

router.get('/', requireAuth, getMyChallenges);
router.post('/:challengeId/claim', requireAuth, claimChallenge);

export default router;
