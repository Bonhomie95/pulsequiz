import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { updateSettings } from '../controllers/settingsController';

const router = Router();

router.patch('/', requireAuth, updateSettings);

export default router;
