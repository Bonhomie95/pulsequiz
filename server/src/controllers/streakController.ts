import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { checkInStreak } from '../services/streakService';
import { getBalance } from '../services/coinService';

/**
 * The player's IANA timezone, sent by the client so the streak day boundary
 * matches their local midnight instead of a single hardcoded zone.
 */
function readTimezone(req: { body?: any; headers: Record<string, any> }): string | null {
  const fromBody = typeof req.body?.timezone === 'string' ? req.body.timezone : null;
  const fromHeader =
    typeof req.headers['x-timezone'] === 'string' ? (req.headers['x-timezone'] as string) : null;
  const tz = fromBody ?? fromHeader;
  // IANA zone names are conservative: letters, digits, +-_ and /.
  return tz && /^[A-Za-z0-9_+\-\/]{1,64}$/.test(tz) ? tz : null;
}


export async function checkIn(req: AuthRequest, res: Response) {
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const result = await checkInStreak(userId, readTimezone(req));

  return res.json({
    streak: result.streak,
    lastCheckIn: result.lastCheckIn,
    coinsAdded: result.coinsAdded,
    milestoneBonus: result.milestoneBonus,
    // Authoritative wallet total so the client can sync instead of adding a
    // delta onto a possibly-stale cached balance.
    coins: await getBalance(userId),
  });
}
