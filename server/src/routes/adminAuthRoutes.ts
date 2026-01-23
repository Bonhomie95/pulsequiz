import { Router } from 'express';
import { adminLogin } from '../controllers/adminAuthController';

const router = Router();

router.post('/login', adminLogin);

export default router;
