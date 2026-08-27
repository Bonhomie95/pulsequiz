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

/**
 * Instrument the root component for navigation/performance.
 *
 * `initSentry` is a no-op without a DSN (local dev, PR builds), but
 * `Sentry.wrap` was being applied unconditionally — wrapping without an init
 * is what produces "App Start Span could not be finished. `Sentry.wrap` was
 * called before `Sentry.init`" on every cold start. When there is nothing to
 * report to, hand the component back untouched.
 *
 * Reads `initialized` rather than `DSN` so the two can never disagree: if init
 * ever starts bailing for another reason, wrap follows it.
 */
export function wrapWithSentry<C>(Component: C): C {
  if (!initialized) return Component;
  return Sentry.wrap(Component as never) as C;
}
