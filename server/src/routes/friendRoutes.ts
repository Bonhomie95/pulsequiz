import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { sensitiveActionLimiter } from '../middlewares/rateLimit';
import {
  searchUsers,
  sendFriendRequest,
  respondToRequest,
  acceptRequest,
  declineRequest,
  unfriendUser,
  blockUser,
  getMyFriends,
  getPendingRequests,
} from '../controllers/friendController';

const router = Router();

router.get('/', requireAuth, getMyFriends);
router.get('/search', requireAuth, searchUsers);
router.get('/requests', requireAuth, getPendingRequests);

router.post('/request', requireAuth, sensitiveActionLimiter, sendFriendRequest);
router.post('/accept', requireAuth, acceptRequest);
router.post('/decline', requireAuth, declineRequest);
router.post('/unfriend', requireAuth, unfriendUser);
router.post('/block', requireAuth, blockUser);

router.post('/:friendId/respond', requireAuth, respondToRequest);

export default router;
