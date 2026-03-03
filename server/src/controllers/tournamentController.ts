import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import Tournament, { ITournamentParticipant } from '../models/Tournament';
import User from '../models/User';
import { debitCoins, creditCoins } from '../services/coinService';

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

export async function joinTournament(req: AuthRequest, res: Response) {
  const tournament = await Tournament.findById(req.params.id);
  if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
  if (tournament.status !== 'upcoming' && tournament.status !== 'active') {
    return res.status(400).json({ message: 'Tournament is not open for joining' });
  }

  const alreadyJoined = tournament.participants.some(
    (p: ITournamentParticipant) => p.userId.toString() === req.userId
  );
  if (alreadyJoined) return res.status(400).json({ message: 'Already joined' });

  if (tournament.participants.length >= tournament.maxParticipants) {
    return res.status(400).json({ message: 'Tournament is full' });
  }

  // Deduct entry fee
  if (tournament.entryFeeCoins > 0) {
    const result = await debitCoins(req.userId!, tournament.entryFeeCoins, 'tournament_entry');
    if (!result.success) return res.status(400).json({ message: 'Insufficient coins for entry fee' });
  }

  const user = await User.findById(req.userId).select('username avatar').lean();
  tournament.participants.push({
    userId: req.userId as any,
    usernameSnapshot: user?.username ?? 'Player',
    avatarSnapshot: user?.avatar ?? 'avatar0',
    score: 0,
    joinedAt: new Date(),
  });

  await tournament.save();
  return res.json({ ok: true });
}

export async function getMyTournaments(req: AuthRequest, res: Response) {
  const tournaments = await Tournament.find({
    'participants.userId': req.userId,
  }).lean();

  return res.json({ tournaments });
}
