import { Router } from 'express';
import { requireAdmin } from '../middlewares/requireAdmin';
import {
  listUsers,
  getUser,
  updateUser,
  toggleBan,
  deleteUser,
} from '../controllers/adminUserController';

const router = Router();

router.use(requireAdmin);

router.get('/',          listUsers);
router.get('/:id',       getUser);
router.patch('/:id',     updateUser);
router.patch('/:id/ban', toggleBan);
router.delete('/:id',    deleteUser);

export default router;
