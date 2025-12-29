import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { updateProfile, getProfile } from '../controllers/profileController';

const router = Router();

router.get('/', requireAuth, getProfile);
router.patch('/', requireAuth, updateProfile);

export default router;
