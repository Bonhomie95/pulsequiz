import { Router } from 'express';
import { requireAdmin, requireSuperAdmin } from '../middlewares/requireAdmin';
import {
  listUsers,
  getUser,
  updateUser,
  adjustCoins,
  toggleBan,
  deleteUser,
} from '../controllers/adminUserController';

const router = Router();

router.use(requireAdmin);

// Read and moderation actions are available to every admin.
router.get('/',          listUsers);
router.get('/:id',       getUser);
router.patch('/:id/ban', toggleBan);

// Anything that moves money or destroys data is SUPER_ADMIN only. Roles were
// defined on the model but never enforced, so a MODERATOR could set any user's
// balance to any number.
router.patch('/:id',        requireSuperAdmin, updateUser);
router.post('/:id/coins',   requireSuperAdmin, adjustCoins);
router.delete('/:id',       requireSuperAdmin, deleteUser);

export default router;
