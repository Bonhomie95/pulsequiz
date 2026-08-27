import * as Sentry from '@sentry/react-native';
import { logger } from './logger';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

let initialized = false;

/**
 * Initialize Sentry crash/error reporting and route the app's `logger` sinks
 * into it. Safe no-op when `EXPO_PUBLIC_SENTRY_DSN` is unset (local dev, PR
 * builds) so nothing breaks before a DSN is provisioned. Call once, as early
 * as possible during startup.
 */
export function initSentry() {
  if (initialized || !DSN) return;
  initialized = true;

  Sentry.init({
    dsn: DSN,
    // Don't spam the dashboard from developer machines.
    enabled: !isDev,
    // Performance tracing sample rate — tune down if volume/cost is a concern.
    tracesSampleRate: 0.2,
    // Attach a JS stack to non-error messages for easier triage.
    attachStacktrace: true,
  });

  // Route the logger's warn/error sinks into Sentry so every logged issue is
  // reported from one place (ErrorBoundary, api interceptor, etc.).
  logger.reportError = (error, context) => {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  };
  logger.reportMessage = (message, context) => {
    Sentry.captureMessage(message, {
      level: 'warning',
      ...(context ? { extra: context } : {}),
    });
  };
}

/**
 * Associate reports with the signed-in user (call after login / auth restore),
 * or pass null to clear on logout.
 */
export function setSentryUser(user: { id: string; username?: string | null } | null) {
  if (!DSN) return;
  Sentry.setUser(user ? { id: user.id, username: user.username ?? undefined } : null);
}

// Re-export the wrapper so the root component can be instrumented for
// navigation/performance without importing Sentry directly elsewhere.
export const wrapWithSentry = Sentry.wrap;
