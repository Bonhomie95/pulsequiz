import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import Tournament, { ITournamentParticipant } from '../models/Tournament';
import { joinTournament as joinTournamentService } from '../services/tournamentService';

export async function getActiveTournaments(req: AuthRequest, res: Response) {
  const tournaments = await Tournament.find({
    status: { $in: ['upcoming', 'active'] },
  }).sort({ startsAt: 1 }).lean();

  return res.json({ tournaments });
}

export async function getTournamentById(req: AuthRequest, res: Response) {
  const tournament = await Tournament.findById(req.params.id).lean();
  if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
  return res.json({ tournament });
}

const JOIN_ERRORS: Record<string, { status: number; message: string }> = {
  not_found:          { status: 404, message: 'Tournament not found' },
  closed:             { status: 400, message: 'Tournament is not open for joining' },
  already_joined:     { status: 400, message: "You've already joined this tournament" },
  full:               { status: 400, message: 'Tournament is full' },
  insufficient_coins: { status: 400, message: 'Not enough coins for the entry fee' },
};

export async function joinTournament(req: AuthRequest, res: Response) {
  // The membership, capacity and fee checks all live in the service as a
  // single conditional update — the previous read-check-write version let two
  // parallel requests both charge the entry fee.
  const result = await joinTournamentService(req.params.id, req.userId!);

  if (!result.ok) {
    const mapped = JOIN_ERRORS[result.error ?? ''] ?? {
      status: 400,
      message: 'Could not join tournament',
    };
    return res.status(mapped.status).json({ message: mapped.message });
  }

  return res.json({ ok: true });
}

export async function getMyTournaments(req: AuthRequest, res: Response) {
  const tournaments = await Tournament.find({
    'participants.userId': req.userId,
  }).lean();

  return res.json({ tournaments });
}
