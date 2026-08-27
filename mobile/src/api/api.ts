import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import { logger } from '@/src/utils/logger';

const baseURL = process.env.EXPO_PUBLIC_API_URL;
if (!baseURL) {
  logger.error('EXPO_PUBLIC_API_URL is not set — API calls will fail.');
}

const api = axios.create({
  baseURL,
  timeout: 15000,
});

// The server uses the caller's timezone for streak day boundaries. Sending it
// on every request means a player's streak rolls over at their local midnight
// rather than a single hardcoded zone.
try {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz) api.defaults.headers.common['X-Timezone'] = tz;
} catch {
  /* older engines without full ICU — the server falls back to UTC */
}

// ── Session hooks ─────────────────────────────────────────────────────────────
// The auth store registers these. We avoid importing the store directly to
// prevent a circular dependency (store imports this module).
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

let refreshTokens: (() => Promise<string | null>) | null = null;
export function setTokenRefresher(fn: (() => Promise<string | null>) | null) {
  refreshTokens = fn;
}

// ── Transient-failure retry ───────────────────────────────────────────────────
// Retry idempotent requests on network errors, timeouts, and 5xx/429 with
// exponential backoff. Mobile networks drop constantly; a couple of quiet
// retries prevent most spurious "something went wrong" alerts. Non-idempotent
// verbs (POST/PATCH/DELETE) are NOT retried unless a caller opts in via
// `config.retry`, to avoid double-submits (e.g. purchases, coin spends).
const MAX_RETRIES = 2;
const IDEMPOTENT = new Set(['get', 'head', 'options']);

type RetryConfig = AxiosRequestConfig & {
  _retryCount?: number;
  _refreshed?: boolean;
  retry?: boolean;
};

function isRetriable(error: AxiosError): boolean {
  const cfg = error.config as RetryConfig | undefined;
  if (!cfg) return false;
  const method = (cfg.method ?? 'get').toLowerCase();
  const optedIn = cfg.retry === true || IDEMPOTENT.has(method);
  if (!optedIn) return false;

  if (!error.response) return true; // network error or timeout
  const status = error.response.status;
  return status >= 500 || status === 429;
}

// Collapse concurrent refreshes into one in-flight request, so twenty parallel
// 401s don't fire twenty refreshes and race each other's token writes.
let refreshInFlight: Promise<string | null> | null = null;

function refreshOnce(): Promise<string | null> {
  if (!refreshTokens) return Promise.resolve(null);
  if (!refreshInFlight) {
    refreshInFlight = refreshTokens().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const cfg = error.config as RetryConfig | undefined;
    const message = (error.response?.data as { message?: string } | undefined)?.message;

    // ── Expired access token → refresh once, then replay the request ──────────
    // Access tokens are now short-lived, so this is the normal path rather than
    // an edge case. "Session expired" means the token version was bumped
    // (logout elsewhere, ban) and refreshing won't help.
    if (
      status === 401 &&
      cfg &&
      !cfg._refreshed &&
      !cfg.url?.includes('/auth/refresh') &&
      message !== 'Session expired'
    ) {
      cfg._refreshed = true;
      const fresh = await refreshOnce();
      if (fresh) {
        cfg.headers = { ...(cfg.headers ?? {}), Authorization: `Bearer ${fresh}` };
        return api(cfg);
      }
    }

    // Retry transient failures with backoff before giving up.
    if (cfg && isRetriable(error)) {
      cfg._retryCount = (cfg._retryCount ?? 0) + 1;
      if (cfg._retryCount <= MAX_RETRIES) {
        const delay = 400 * 2 ** (cfg._retryCount - 1); // 400ms, 800ms
        await new Promise((r) => setTimeout(r, delay));
        return api(cfg);
      }
    }

    // Only report genuine server failures to the crash reporter — expected
    // 4xx (validation, auth, business rules) would flood Sentry with noise.
    const meta = { url: cfg?.url, method: cfg?.method, status };
    if (!error.response || (typeof status === 'number' && status >= 500)) {
      logger.error('API server error', error, meta);
    } else {
      logger.debug('API error', meta);
    }

    // 401 after a failed refresh, or an explicit ban, ends the session.
    // 403 is only a session-killer when the account is banned — the server
    // also uses 403 for business-rule denials (blocked friend request, IAP
    // ownership mismatch) that must NOT log the user out.
    if (
      status === 401 ||
      (status === 403 && typeof message === 'string' && /banned/i.test(message))
    ) {
      onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);

// ── Token helpers ─────────────────────────────────────────────────────────────
// NO async request interceptor — it causes a race condition where the token
// hasn't been read from SecureStore yet when the first requests fire.
// Instead, call setAuthToken() immediately after login/restore and it will
// be attached to every subsequent request via api.defaults.headers.

export function setAuthToken(token: string | null) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

/**
 * A user-facing message for a failed request.
 *
 * Prefers the server's own message (they are written for users), falls back to
 * something specific about the failure mode rather than a generic apology.
 */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const e = err as AxiosError<{ message?: string }>;
  if (e?.response?.data?.message) return e.response.data.message;
  if (e?.code === 'ECONNABORTED') return 'That took too long. Check your connection and try again.';
  if (e && !e.response) return "Can't reach PulseQuiz. Check your connection.";
  return fallback;
}

export { api };
