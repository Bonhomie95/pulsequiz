import { Router } from 'express';
import { requireAdmin } from '../middlewares/requireAdmin';
import { listPurchases } from '../controllers/adminPurchaseController';

const router = Router();
router.use(requireAdmin);
router.get('/', listPurchases);
export default router;
