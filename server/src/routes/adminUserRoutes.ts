import { Router } from 'express';
import { requireAdmin } from '../middlewares/requireAdmin';
import {
  listUsers,
  toggleBan,
} from '../controllers/adminUserController';

const router = Router();

router.use(requireAdmin);

router.get('/', listUsers);
router.patch('/:id/ban', toggleBan);

export default router;
