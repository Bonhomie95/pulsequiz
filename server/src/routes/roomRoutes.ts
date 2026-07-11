import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { sensitiveActionLimiter } from '../middlewares/rateLimit';
import { createRoom, joinRoom, getRoomByCode } from '../controllers/roomController';

const router = Router();

router.post('/create', requireAuth, sensitiveActionLimiter, createRoom);
router.post('/join', requireAuth, sensitiveActionLimiter, joinRoom);
router.get('/:code', requireAuth, getRoomByCode);

export default router;
