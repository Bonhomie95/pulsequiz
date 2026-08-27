import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { sensitiveActionLimiter, roomJoinLimiter } from '../middlewares/rateLimit';
import { createRoom, joinRoom, getRoomByCode } from '../controllers/roomController';

const router = Router();

router.post('/create', requireAuth, sensitiveActionLimiter, createRoom);
// Room codes are short and enumerable — a tighter budget on the lookup paths
// stops an attacker walking the space to find open wagered rooms.
router.post('/join', requireAuth, roomJoinLimiter, joinRoom);
router.get('/:code', requireAuth, roomJoinLimiter, getRoomByCode);

export default router;
