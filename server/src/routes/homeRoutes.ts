import { Router } from 'express';
import { getHomeSummary, getReadyPlayers } from '../controllers/homeController';
import {requireAuth } from '../middlewares/auth';
export const router = Router();


router.get('/summary', requireAuth, getHomeSummary);
router.get('/ready-players', requireAuth, getReadyPlayers);

export default router;