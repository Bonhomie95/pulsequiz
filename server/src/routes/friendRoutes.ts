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
  unblockUser,
  getMyFriends,
  getPendingRequests,
} from '../controllers/friendController';

const router = Router();

router.get('/', requireAuth, getMyFriends);
// Search enumerates usernames, so give it its own budget rather than leaving
// it on the blanket global limiter.
router.get('/search', requireAuth, sensitiveActionLimiter, searchUsers);
router.get('/requests', requireAuth, getPendingRequests);

// Every mutating action is rate limited — sending requests spams other
// people's devices, and the rest write to shared state.
router.post('/request', requireAuth, sensitiveActionLimiter, sendFriendRequest);
router.post('/accept', requireAuth, sensitiveActionLimiter, acceptRequest);
router.post('/decline', requireAuth, sensitiveActionLimiter, declineRequest);
router.post('/unfriend', requireAuth, sensitiveActionLimiter, unfriendUser);
router.post('/block', requireAuth, sensitiveActionLimiter, blockUser);
router.post('/unblock', requireAuth, sensitiveActionLimiter, unblockUser);

router.post('/:friendId/respond', requireAuth, sensitiveActionLimiter, respondToRequest);

export default router;
