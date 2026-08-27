import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';

import { admobSsvCallback } from '../controllers/adsController';
import {
  verifyAppleJws,
  handleAppleNotification,
  handleGoogleNotification,
} from '../services/storeNotifications';
import { logger } from '../utils/logger';
import { webhookLimiter } from '../middlewares/rateLimit';

const router = Router();

// Every route here authenticates by signature or provider identity token, not
// by user session. They are still rate limited so a flood can't be used as a
// cheap amplification vector.
router.use(webhookLimiter);

/* ── AdMob server-side verification ─────────────────────────────────────── */
// Google sends a GET with a signed query string. Configure this URL in the
// AdMob console under the rewarded ad unit's "server-side verification".
router.get('/admob/ssv', admobSsvCallback);

/* ── Apple App Store Server Notifications V2 ────────────────────────────── */
router.post('/apple', async (req: Request, res: Response) => {
  const signedPayload = (req.body as { signedPayload?: string })?.signedPayload;
  if (!signedPayload) return res.status(400).send('missing signedPayload');

  const verified = verifyAppleJws(signedPayload);
  if (!verified.valid) {
    logger.warn('Rejected Apple notification', { reason: verified.reason });
    // 200 so Apple stops retrying something that will never verify.
    return res.status(200).send('rejected');
  }

  try {
    await handleAppleNotification(verified.payload);
    return res.status(200).send('ok');
  } catch (err) {
    logger.error('Apple notification handling failed', err);
    // Non-2xx asks Apple to retry — the notification was genuine.
    return res.status(500).send('error');
  }
});

/* ── Google Play Real-Time Developer Notifications ──────────────────────── */

const oauthClient = new OAuth2Client();

/**
 * Pub/Sub push subscriptions can be configured with an OIDC token; when
 * PUBSUB_VERIFICATION_AUDIENCE is set we require and verify it. Otherwise we
 * fall back to a shared secret in the path, compared in constant time.
 */
async function verifyGoogleCaller(req: Request): Promise<boolean> {
  const audience = process.env.PUBSUB_VERIFICATION_AUDIENCE;
  if (audience) {
    const bearer = req.headers.authorization?.replace('Bearer ', '');
    if (!bearer) return false;
    try {
      const ticket = await oauthClient.verifyIdToken({ idToken: bearer, audience });
      const email = ticket.getPayload()?.email;
      const expected = process.env.PUBSUB_SERVICE_ACCOUNT_EMAIL;
      if (expected && email !== expected) return false;
      return true;
    } catch {
      return false;
    }
  }

  const secret = process.env.GOOGLE_RTDN_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';

  const provided = typeof req.query.token === 'string' ? req.query.token : '';
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.post('/google', async (req: Request, res: Response) => {
  if (!(await verifyGoogleCaller(req))) {
    logger.warn('Rejected Google RTDN — caller not verified');
    return res.status(401).send('unauthorized');
  }

  try {
    await handleGoogleNotification(req.body);
    // Always ack a verified message; Pub/Sub redelivers on non-2xx and an
    // unhandled notification type would otherwise loop forever.
    return res.status(200).send('ok');
  } catch (err) {
    logger.error('Google notification handling failed', err);
    return res.status(500).send('error');
  }
});

export default router;
