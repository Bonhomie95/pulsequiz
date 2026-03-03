import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { createRoom, joinRoom, getRoomByCode } from '../controllers/roomController';

const router = Router();

router.post('/create', requireAuth, createRoom);
router.post('/join', requireAuth, joinRoom);
router.get('/:code', requireAuth, getRoomByCode);

export default router;
