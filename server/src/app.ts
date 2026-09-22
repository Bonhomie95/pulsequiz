import path from 'path';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { globalApiLimiter } from './middlewares/rateLimit';
import { requestContext } from './middlewares/requestContext';
import { logger } from './utils/logger';
import { getHealth, getMetrics } from './controllers/healthController';

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
import webhookRoutes from './routes/webhookRoutes';

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
import adminAdminsRoutes from './routes/adminAdminsRoutes';
import adminAuditRoutes from './routes/adminAuditRoutes';
import competeRoutes from './routes/competeRoutes';
import { DUEL_CODE_RE } from './services/duelService';

/**
 * FRONTEND_ORIGIN supports a comma-separated list, e.g.
 *   FRONTEND_ORIGIN=https://admin.pulsequiz.app,https://pulsequiz.app
 * Unset or "*" allows any origin (fine for dev; set it in production).
 */
export function getAllowedOrigins(): string[] | '*' {
  const raw = (process.env.FRONTEND_ORIGIN ?? '').trim();
  if (!raw || raw === '*') {
    // server.ts refuses to boot in production with this configuration; in
    // development we allow everything so the Expo dev client and the Vite
    // admin can both connect without extra setup.
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FRONTEND_ORIGIN must be set to an explicit origin list in production');
    }
    return '*';
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const app = express();

// How many reverse proxies sit in front of us. Getting this wrong either
// breaks IP-based rate limiting (too low) or lets a client spoof
// X-Forwarded-For and bypass it entirely (too high). Set it to the real hop
// count for your deployment.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
app.disable('x-powered-by');
app.use(helmet());
app.use(requestContext);
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
// Store the raw body for the webhook routes, which must verify a signature
// over the exact bytes the provider sent.
const jsonParser = express.json({
  limit: '256kb',
  verify: (req, _res, buf) => {
    (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
  },
});
// Bulk question import is the one legitimately large body; its router parses
// it with a bigger limit only AFTER admin auth, so anonymous callers can't
// make us buffer megabytes.
const QUESTION_IMPORT_PATH = '/api/admin/questions/import';
app.use((req, res, next) =>
  req.path === QUESTION_IMPORT_PATH ? next() : jsonParser(req, res, next),
);

// Public legal pages — app-store reviewers open these, and Google Play needs a
// web account-deletion URL. Point the pulsequiz.app website at these paths
// (or proxy them) so the in-app links resolve.
const LEGAL_DIR = path.join(__dirname, '..', 'public', 'legal');
for (const page of ['terms', 'privacy', 'rules', 'support', 'delete-account']) {
  app.get(`/${page}`, (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(path.join(LEGAL_DIR, `${page}.html`));
  });
}

// Share links for async friend challenges: https://<host>/d/ABC123 opens the
// app (pulsequiz://duel/ABC123) or points to the stores.
const PLAY_URL =
  process.env.PLAY_STORE_URL ||
  'https://play.google.com/store/apps/details?id=com.bonhomie95.pulsequiz';
const APP_STORE_URL = process.env.APP_STORE_URL || '';
app.get('/d/:code', (req, res) => {
  const code = String(req.params.code).toUpperCase();
  if (!DUEL_CODE_RE.test(code)) return res.status(404).send('Not found');
  const deep = `pulsequiz://duel/${code}`;
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>PulseQuiz challenge</title>
<style>body{margin:0;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0b0f1a;color:#e5e7eb;display:flex;min-height:100vh;align-items:center;justify-content:center}
main{max-width:420px;padding:24px 16px;text-align:center}h1{font-size:24px;margin:0 0 8px}code{font-size:28px;letter-spacing:4px;color:#8ea2ff}
a.btn{display:block;margin:12px 0;padding:14px;border-radius:14px;background:#3f57c9;color:#fff;text-decoration:none;font-weight:700}
a.alt{background:#141a2b}</style></head><body><main>
<h1>You've been challenged!</h1><p>Answer the same 10 questions as your friend and see who wins.</p>
<p><code>${code}</code></p>
<a class="btn" href="${deep}">Open in PulseQuiz</a>
${APP_STORE_URL ? `<a class="btn alt" href="${APP_STORE_URL}">Get it on the App Store</a>` : ''}
<a class="btn alt" href="${PLAY_URL}">Get it on Google Play</a>
<p style="color:#a6b0cf;font-size:14px">Already have the app? Open PulseQuiz → Challenge a friend → Enter code.</p>
</main></body></html>`);
});

app.get('/health', getHealth);
app.get('/metrics', getMetrics);

// Store/ad-network callbacks authenticate by signature, not by session, so
// they sit outside the per-user limiter.
app.use('/api/webhooks', webhookRoutes);

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
app.use('/api',              competeRoutes); // /daily, /leagues/current, /duels

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
app.use('/api/admin/audit',          adminAuditRoutes);
app.use('/api/admin/admins',         adminAdminsRoutes);

// ── Fallthrough handlers ─────────────────────────────────────────────────────
app.use((_, res) => res.status(404).json({ message: 'Not found' }));

app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON body' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Request body too large' });
  }
  // A malformed ObjectId in a path param is a client error, not a server fault.
  if (err?.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid identifier' });
  }
  if (err?.name === 'ValidationError') {
    return res.status(400).json({ message: 'Invalid payload' });
  }

  const requestId = (req as Request & { id?: string }).id;
  logger.error('Unhandled request error', err, {
    method: req.method,
    path: req.path,
    requestId,
  });
  return res.status(500).json({ message: 'Server error', requestId });
});

export default app;
