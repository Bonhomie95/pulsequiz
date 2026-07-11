import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { globalApiLimiter } from './middlewares/rateLimit';
import { startLeaderboardCron } from './cron/leaderboardCron';
import { initDefaultSettings } from './models/AppSettings';

// User routes
import authRoutes from './routes/authRoutes';
import progressRoutes from './routes/progressRoutes';
import quizRoutes from './routes/quizRoutes';
import leaderboardRoutes from './routes/leaderboardRoutes';
import profileRoutes from './routes/profileRoutes';
import settingsRoutes from './routes/settingsRoutes';
import streakRoutes from './routes/streakRoutes';
import coinRoutes from './routes/coinRoutes';
import homeRoutes from './routes/homeRoutes';
import adsRoutes from './routes/adsRoutes';
import purchaseRoutes from './routes/purchase';
import subscriptionRoutes from './routes/subscriptionRoutes';
import payoutRoutes from './routes/payoutRoutes';
import challengeRoutes from './routes/challengeRoutes';
import friendRoutes from './routes/friendRoutes';
import roomRoutes from './routes/roomRoutes';
import referralRoutes from './routes/referralRoutes';
import tournamentRoutes from './routes/tournamentRoutes';
import pushTokenRoutes from './routes/pushTokenRoutes';
import reportRoutes from './routes/reportRoutes';

// Admin routes
import adminAuthRoutes from './routes/adminAuthRoutes';
import adminStatsRoutes from './routes/adminStatsRoutes';
import adminActivityRoutes from './routes/adminActivityRoutes';
import adminUserRoutes from './routes/adminUserRoutes';
import adminPayoutRoutes from './routes/adminPayoutRoutes';
import adminChallengeRoutes from './routes/adminChallengeRoutes';
import adminAntiCheatRoutes from './routes/adminAntiCheatRoutes';
import adminSettingsRoutes from './routes/adminSettingsRoutes';
import adminPurchaseRoutes from './routes/adminPurchaseRoutes';
import adminQuestionsRoutes from './routes/adminQuestionsRoutes';
import adminSubscriptionRoutes from './routes/adminSubscriptionRoutes';
import adminTournamentRoutes from './routes/adminTournamentRoutes';
import adminReportRoutes from './routes/adminReportRoutes';
import adminAnalyticsRoutes from './routes/adminAnalyticsRoutes';
import adminLeaderboardRoutes from './routes/adminLeaderboardRoutes';

/**
 * FRONTEND_ORIGIN supports a comma-separated list, e.g.
 *   FRONTEND_ORIGIN=https://admin.pulsequiz.app,https://pulsequiz.app
 * Unset or "*" allows any origin (fine for dev; set it in production).
 */
export function getAllowedOrigins(): string[] | '*' {
  const raw = (process.env.FRONTEND_ORIGIN ?? '').trim();
  if (!raw || raw === '*') return '*';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
// credentials:true is required for the admin SPA's httpOnly cookie. When
// FRONTEND_ORIGIN is unset ('*') we reflect the request origin (origin:true)
// rather than send a literal '*', which browsers reject alongside credentials.
const allowedOrigins = getAllowedOrigins();
app.use(
  cors({
    origin: allowedOrigins === '*' ? true : allowedOrigins,
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));

initDefaultSettings().catch(console.error);
startLeaderboardCron();

app.get('/health', (_, res) => res.json({ ok: true }));

app.use('/api', globalApiLimiter);

// ── User routes ──────────────────────────────────────────────────────────────
app.use('/api/auth',         authRoutes);
app.use('/api/progress',     progressRoutes);
app.use('/api/quiz',         quizRoutes);
app.use('/api/leaderboard',  leaderboardRoutes);
app.use('/api/profile',      profileRoutes);
app.use('/api/settings',     settingsRoutes);
app.use('/api/streak',       streakRoutes);
app.use('/api/coins',        coinRoutes);
app.use('/api/home',         homeRoutes);
app.use('/api/ads',          adsRoutes);
app.use('/api/purchase',     purchaseRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/payouts',      payoutRoutes);
app.use('/api/challenges',   challengeRoutes);
app.use('/api/friends',      friendRoutes);
app.use('/api/rooms',        roomRoutes);
app.use('/api/referrals',    referralRoutes);
app.use('/api/tournaments',  tournamentRoutes);
app.use('/api/push',         pushTokenRoutes);
app.use('/api/reports',      reportRoutes);

// ── Admin routes ─────────────────────────────────────────────────────────────
app.use('/api/admin',                adminAuthRoutes);
app.use('/api/admin/stats',          adminStatsRoutes);
app.use('/api/admin/activity',       adminActivityRoutes);
app.use('/api/admin/users',          adminUserRoutes);
app.use('/api/admin/payouts',        adminPayoutRoutes);
app.use('/api/admin/challenges',     adminChallengeRoutes);
app.use('/api/admin/anticheat',      adminAntiCheatRoutes);
app.use('/api/admin/settings',       adminSettingsRoutes);
app.use('/api/admin/purchases',      adminPurchaseRoutes);
app.use('/api/admin/questions',      adminQuestionsRoutes);
app.use('/api/admin/subscriptions',  adminSubscriptionRoutes);
app.use('/api/admin/tournaments',    adminTournamentRoutes);
app.use('/api/admin/reports',        adminReportRoutes);
app.use('/api/admin/analytics',      adminAnalyticsRoutes);
app.use('/api/admin/leaderboard',    adminLeaderboardRoutes);

// ── Fallthrough handlers ─────────────────────────────────────────────────────
app.use((_, res) => res.status(404).json({ message: 'Not found' }));

app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON body' });
  }
  console.error(`Unhandled error on ${req.method} ${req.path}:`, err);
  return res.status(500).json({ message: 'Server error' });
});

export default app;
