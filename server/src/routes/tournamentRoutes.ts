import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import {
  getActiveTournaments,
  getTournamentById,
  joinTournament,
  getMyTournaments,
} from '../controllers/tournamentController';

const router = Router();

router.get('/', requireAuth, getActiveTournaments);
router.get('/mine', requireAuth, getMyTournaments);
router.get('/:id', requireAuth, getTournamentById);
router.post('/:id/join', requireAuth, joinTournament);

export default router;
