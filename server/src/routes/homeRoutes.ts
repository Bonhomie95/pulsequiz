import { Router } from 'express';
import { getHomeSummary } from '../controllers/homeController';
import {requireAuth } from '../middlewares/auth';
export const router = Router();


router.get('/summary', requireAuth, getHomeSummary);

export default router;