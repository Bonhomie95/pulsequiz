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
import purchaseRoutes from './routes/purchase';

const app = express();

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));
app.set('trust proxy', 1);

startLeaderboardCron();

app.get('/health', (_, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/streak', streakRoutes);
app.use('/api/coins', coinRoutes);
app.use('/api/home', homeRoutes);
app.use('/api/ads', adsRoutes);
app.use('/api/admin', adminAuthRoutes);
app.use('/api/admin/stats', adminStatsRoutes);
app.use('/api/admin/activity', adminActivityRoutes);

// app.use('/api/purchase', purchaseRoutes);

export default app;
