import express from 'express';
import cors from 'cors';

import authRoutes from './routes/authRoutes';
import progressRoutes from './routes/progressRoutes';
import quizRoutes from './routes/quizRoutes';
import leaderboardRoutes from './routes/leaderboardRoutes';
import profileRoutes from './routes/profileRoutes';
import settingsRoutes from './routes/settingsRoutes';
import { startLeaderboardCron } from './cron/leaderboardCron';
import streakRoutes from './routes/streakRoutes';
import coinRoutes from './routes/coinRoutes';
import homeRoutes from './routes/homeRoutes';
import adsRoutes from './routes/adsRoutes';
import adminAuthRoutes from './routes/adminAuthRoutes';
import adminStatsRoutes from './routes/adminStatsRoutes';
import adminActivityRoutes from './routes/adminActivityRoutes';
import adminUserRoutes from './routes/adminUserRoutes';
import purchaseRoutes from './routes/purchase';
import subscriptionRoutes from './routes/subscriptionRoutes';

// Game routes
import payoutRoutes from './routes/payoutRoutes';
import challengeRoutes from './routes/challengeRoutes';
import friendRoutes from './routes/friendRoutes';
import roomRoutes from './routes/roomRoutes';
import referralRoutes from './routes/referralRoutes';
import tournamentRoutes from './routes/tournamentRoutes';
import pushTokenRoutes from './routes/pushTokenRoutes';

// Admin routes
import adminPayoutRoutes from './routes/adminPayoutRoutes';
import adminChallengeRoutes from './routes/adminChallengeRoutes';
import adminAntiCheatRoutes from './routes/adminAntiCheatRoutes';
import adminSettingsRoutes from './routes/adminSettingsRoutes';
import adminPurchaseRoutes from './routes/adminPurchaseRoutes';
import adminQuestionsRoutes from './routes/adminQuestionsRoutes';
import adminSubscriptionRoutes from './routes/adminSubscriptionRoutes'; // ← NEW
import adminTournamentRoutes from './routes/adminTournamentRoutes';     // ← replaces old
import adminReportRoutes from './routes/adminReportRoutes';             // ← NEW
import adminAnalyticsRoutes from './routes/adminAnalyticsRoutes';
import adminLeaderboardRoutes from './routes/adminLeaderboardRoutes';

import { initDefaultSettings } from './models/AppSettings';

const app = express();

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));
app.set('trust proxy', 1);

initDefaultSettings().catch(console.error);
startLeaderboardCron();

app.get('/health', (_, res) => res.json({ ok: true }));

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

// ── Admin routes ──────────────────────────────────────────────────────────────
app.use('/api/admin',                   adminAuthRoutes);
app.use('/api/admin/stats',             adminStatsRoutes);
app.use('/api/admin/activity',          adminActivityRoutes);
app.use('/api/admin/users',             adminUserRoutes);
app.use('/api/admin/payouts',           adminPayoutRoutes);
app.use('/api/admin/challenges',        adminChallengeRoutes);
app.use('/api/admin/anticheat',         adminAntiCheatRoutes);
app.use('/api/admin/settings',          adminSettingsRoutes);
app.use('/api/admin/purchases',         adminPurchaseRoutes);
app.use('/api/admin/questions',         adminQuestionsRoutes);
app.use('/api/admin/subscriptions',     adminSubscriptionRoutes); // ← NEW
app.use('/api/admin/tournaments',       adminTournamentRoutes);   // ← updated
app.use('/api/admin/reports',           adminReportRoutes);       // ← NEW
app.use('/api/admin/analytics',         adminAnalyticsRoutes);
app.use('/api/admin/leaderboard',        adminLeaderboardRoutes);

export default app;
